#!/usr/bin/env bash
set -euo pipefail

# =============================================================
# Forensics GPU Toggle Script
#
# Manages the on-demand GPU instance for document forensics.
# The GPU runs on a g4dn.xlarge (NVIDIA T4) behind ECS EC2.
#
# Usage:
#   AWS_PROFILE=banyan bash scripts/forensics-gpu.sh on
#   AWS_PROFILE=banyan bash scripts/forensics-gpu.sh off
#   AWS_PROFILE=banyan bash scripts/forensics-gpu.sh status
# =============================================================

# Disable AWS CLI pager (avoids getting stuck in less)
export AWS_PAGER=""

# Lockdir — prevent concurrent on/off runs (mkdir is atomic on all platforms)
LOCKDIR="/tmp/forensics-gpu.lock"
if [[ "${1:-status}" != "status" ]]; then
  if ! mkdir "$LOCKDIR" 2>/dev/null; then
    echo "ERROR: Another forensics-gpu.sh is already running."
    echo "If you're sure it's stale: rm -rf $LOCKDIR"
    exit 1
  fi
  trap 'rm -rf "$LOCKDIR"' EXIT
fi

REGION="ap-southeast-1"
CLUSTER="banyan-prod-cluster"
SERVICE="banyan-prod-forensics-gpu-service"
ASG="banyan-prod-forensics-gpu-asg"
GPU_TG_NAME="banyan-prod-forensics-gpu-tg"
CPU_TG_NAME="banyan-prod-forensics-tg"
ALB_NAME="banyan-prod-alb"
ACTION="${1:-status}"

# =============================================================
# Helper: update ALB listener rule weights
# =============================================================
update_alb_weights() {
  local cpu_weight="$1"
  local gpu_weight="$2"

  echo ">>> Updating ALB weights: CPU=$cpu_weight, GPU=$gpu_weight..."

  # Resolve ARNs
  local ALB_ARN
  ALB_ARN=$(aws elbv2 describe-load-balancers \
    --names "$ALB_NAME" --region "$REGION" \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)

  local LISTENER_ARN
  LISTENER_ARN=$(aws elbv2 describe-listeners \
    --load-balancer-arn "$ALB_ARN" --region "$REGION" \
    --query "Listeners[?Port==\`443\`].ListenerArn" --output text)

  local RULE_ARN
  RULE_ARN=$(aws elbv2 describe-rules \
    --listener-arn "$LISTENER_ARN" --region "$REGION" \
    --query "Rules[?Priority=='200'].RuleArn" --output text)

  local CPU_TG_ARN
  CPU_TG_ARN=$(aws elbv2 describe-target-groups \
    --names "$CPU_TG_NAME" --region "$REGION" \
    --query 'TargetGroups[0].TargetGroupArn' --output text)

  local GPU_TG_ARN
  GPU_TG_ARN=$(aws elbv2 describe-target-groups \
    --names "$GPU_TG_NAME" --region "$REGION" \
    --query 'TargetGroups[0].TargetGroupArn' --output text)

  aws elbv2 modify-rule \
    --rule-arn "$RULE_ARN" \
    --region "$REGION" \
    --actions "[{
      \"Type\": \"forward\",
      \"ForwardConfig\": {
        \"TargetGroups\": [
          {\"TargetGroupArn\": \"$CPU_TG_ARN\", \"Weight\": $cpu_weight},
          {\"TargetGroupArn\": \"$GPU_TG_ARN\", \"Weight\": $gpu_weight}
        ],
        \"TargetGroupStickinessConfig\": {\"Enabled\": false, \"DurationSeconds\": 1}
      }
    }]" \
    --query 'Rules[0].Actions[0].ForwardConfig.TargetGroups[*].{ARN:TargetGroupArn,Weight:Weight}' \
    --output table
}

# =============================================================
# Helper: wait for condition with timeout
# =============================================================
wait_for() {
  local description="$1"
  local check_cmd="$2"
  local timeout_seconds="${3:-300}"
  local interval="${4:-10}"

  echo "    Waiting for $description (timeout: ${timeout_seconds}s)..."
  local elapsed=0
  while [ "$elapsed" -lt "$timeout_seconds" ]; do
    if eval "$check_cmd" >/dev/null 2>&1; then
      echo "    $description — done"
      return 0
    fi
    sleep "$interval"
    elapsed=$((elapsed + interval))
    echo "    ... $elapsed/${timeout_seconds}s"
  done
  echo "    TIMEOUT: $description did not complete within ${timeout_seconds}s"
  return 1
}

# =============================================================
# Helper: get ASG instance IDs (all lifecycle states)
# =============================================================
get_asg_instance_ids() {
  aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-names "$ASG" \
    --region "$REGION" \
    --query 'AutoScalingGroups[0].Instances[*].InstanceId' --output text 2>/dev/null || echo ""
}

# =============================================================
# Helper: complete lifecycle hooks and force-terminate instances
# =============================================================
force_cleanup_instances() {
  local INSTANCE_IDS
  INSTANCE_IDS=$(get_asg_instance_ids)

  if [ -z "$INSTANCE_IDS" ] || [ "$INSTANCE_IDS" = "None" ]; then
    return 0
  fi

  # Get lifecycle hook names for this ASG
  local HOOKS
  HOOKS=$(aws autoscaling describe-lifecycle-hooks \
    --auto-scaling-group-name "$ASG" \
    --region "$REGION" \
    --query 'LifecycleHooks[*].LifecycleHookName' --output text 2>/dev/null || echo "")

  for IID in $INSTANCE_IDS; do
    # Complete any pending lifecycle actions (ABANDON = skip waiting)
    if [ -n "$HOOKS" ] && [ "$HOOKS" != "None" ]; then
      for HOOK in $HOOKS; do
        echo "    Completing lifecycle hook '$HOOK' for $IID..."
        aws autoscaling complete-lifecycle-action \
          --lifecycle-hook-name "$HOOK" \
          --auto-scaling-group-name "$ASG" \
          --instance-id "$IID" \
          --lifecycle-action-result "ABANDON" \
          --region "$REGION" 2>/dev/null || true
      done
    fi

    # Force terminate via EC2 API
    echo "    Force-terminating $IID..."
    aws ec2 terminate-instances \
      --instance-ids "$IID" \
      --region "$REGION" \
      --query 'TerminatingInstances[*].{Id:InstanceId,State:CurrentState.Name}' \
      --output table 2>/dev/null || true
  done
}

# =============================================================
# Helper: deregister all container instances from ECS cluster
# =============================================================
deregister_container_instances() {
  echo ">>> Deregistering container instances from ECS cluster..."

  # Get both ACTIVE and DRAINING container instances
  local CI_ARNS=""
  local ACTIVE_ARNS
  ACTIVE_ARNS=$(aws ecs list-container-instances \
    --cluster "$CLUSTER" --status ACTIVE --region "$REGION" \
    --query 'containerInstanceArns[]' --output text 2>/dev/null || echo "")
  local DRAINING_ARNS
  DRAINING_ARNS=$(aws ecs list-container-instances \
    --cluster "$CLUSTER" --status DRAINING --region "$REGION" \
    --query 'containerInstanceArns[]' --output text 2>/dev/null || echo "")

  # Combine both lists
  for ARN in $ACTIVE_ARNS $DRAINING_ARNS; do
    if [ -n "$ARN" ] && [ "$ARN" != "None" ]; then
      CI_ARNS="$CI_ARNS $ARN"
    fi
  done

  if [ -z "$(echo "$CI_ARNS" | tr -d ' ')" ]; then
    echo "    No container instances to deregister."
    return 0
  fi

  for CI_ARN in $CI_ARNS; do
    echo "    Deregistering $CI_ARN..."
    aws ecs deregister-container-instance \
      --cluster "$CLUSTER" \
      --container-instance "$CI_ARN" \
      --force \
      --region "$REGION" \
      --query 'containerInstance.status' --output text 2>/dev/null || true
  done
}

# =============================================================
# Helper: wait for ASG to have 0 instances, force if stuck
# =============================================================
wait_for_clean_asg() {
  local timeout="${1:-300}"
  local force_after="${2:-90}"

  echo ">>> Waiting for all ASG instances to terminate (timeout: ${timeout}s)..."
  local elapsed=0
  local force_attempted=false

  while [ "$elapsed" -lt "$timeout" ]; do
    local INSTANCE_IDS
    INSTANCE_IDS=$(get_asg_instance_ids)

    if [ -z "$INSTANCE_IDS" ] || [ "$INSTANCE_IDS" = "None" ]; then
      echo "    All instances terminated."
      return 0
    fi

    # After force_after seconds, try force cleanup
    if [ "$elapsed" -ge "$force_after" ] && [ "$force_attempted" = false ]; then
      echo "    Instances still present after ${force_after}s, forcing cleanup..."
      force_cleanup_instances
      force_attempted=true
    fi

    sleep 15
    elapsed=$((elapsed + 15))
    echo "    ... $elapsed/${timeout}s"
  done

  echo "    WARNING: Instances did not terminate within ${timeout}s."
  echo "    Check: AWS_PROFILE=banyan bash scripts/forensics-gpu.sh status"
  return 1
}

# =============================================================
# GPU ON
# =============================================================
gpu_on() {
  echo "=== Starting GPU Forensics Instance ==="
  echo ""

  # 0. Check for stale instances and wait for clean state
  local EXISTING
  EXISTING=$(get_asg_instance_ids)
  if [ -n "$EXISTING" ] && [ "$EXISTING" != "None" ]; then
    echo ">>> Existing ASG instances found, cleaning up first..."
    # Ensure service is at 0 so tasks drain
    aws ecs update-service \
      --cluster "$CLUSTER" \
      --service "$SERVICE" \
      --desired-count 0 \
      --region "$REGION" \
      --query 'service.serviceName' --output text 2>/dev/null || true
    # Deregister container instances so lifecycle hooks complete
    deregister_container_instances
    # Remove scale-in protection
    for IID in $EXISTING; do
      aws autoscaling set-instance-protection \
        --instance-ids "$IID" \
        --auto-scaling-group-name "$ASG" \
        --no-protected-from-scale-in \
        --region "$REGION" 2>/dev/null || true
    done
    # Set ASG to 0
    aws autoscaling set-desired-capacity \
      --auto-scaling-group-name "$ASG" \
      --desired-capacity 0 \
      --region "$REGION" 2>/dev/null || true
    wait_for_clean_asg 180 30
    echo ""
  fi

  # 1. Set ASG desired capacity to 1
  echo ">>> Setting ASG desired capacity to 1..."
  aws autoscaling set-desired-capacity \
    --auto-scaling-group-name "$ASG" \
    --desired-capacity 1 \
    --region "$REGION"

  # 2. Wait for container instance to register with cluster
  echo ">>> Waiting for EC2 instance to register with ECS cluster..."
  wait_for "container instance registration" \
    "[ \$(aws ecs list-container-instances --cluster $CLUSTER --status ACTIVE --region $REGION --query 'length(containerInstanceArns)' --output text) -gt 0 ]" \
    300 15

  # 3. Set GPU ECS service desired count to 1
  echo ">>> Setting GPU ECS service desired count to 1..."
  aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "$SERVICE" \
    --desired-count 1 \
    --region "$REGION" \
    --query 'service.serviceName' --output text

  # 4. Wait for GPU task to become healthy in target group
  echo ">>> Waiting for GPU target to become healthy..."
  local GPU_TG_ARN
  GPU_TG_ARN=$(aws elbv2 describe-target-groups \
    --names "$GPU_TG_NAME" --region "$REGION" \
    --query 'TargetGroups[0].TargetGroupArn' --output text)

  wait_for "GPU target healthy" \
    "aws elbv2 describe-target-health --target-group-arn $GPU_TG_ARN --region $REGION --query 'TargetHealthDescriptions[?TargetHealth.State==\`healthy\`]' --output text | grep -q healthy" \
    360 15

  # 5. Switch ALB weights to GPU only
  update_alb_weights 0 100

  echo ""
  echo "=== GPU instance running ==="
  echo ""
  echo "ALB is now routing 100% traffic to GPU."
  echo "Monitor with:"
  echo "  AWS_PROFILE=banyan bash scripts/forensics-gpu.sh status"
}

# =============================================================
# GPU OFF
# =============================================================
gpu_off() {
  echo "=== Stopping GPU Forensics Instance ==="
  echo ""

  # 1. Switch ALB weights back to CPU-only (immediate, stops new GPU requests)
  update_alb_weights 100 0

  # 2. Set GPU ECS service desired count to 0
  echo ">>> Setting GPU ECS service desired count to 0..."
  aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "$SERVICE" \
    --desired-count 0 \
    --region "$REGION" \
    --query 'service.serviceName' --output text

  # 3. Wait for running tasks to drain
  echo ">>> Waiting for GPU tasks to stop..."
  wait_for "task drain" \
    "[ \$(aws ecs describe-services --cluster $CLUSTER --services $SERVICE --region $REGION --query 'services[0].runningCount' --output text) -eq 0 ]" \
    180 10

  # 4. Deregister container instances from ECS cluster
  #    This is critical: the ECS managed draining lifecycle hook will hold
  #    the instance in Terminating:Wait until container instances are gone.
  #    Force-deregistering tells ECS there's nothing left to drain.
  deregister_container_instances

  # 5. Remove scale-in protection from ASG instances
  echo ">>> Removing scale-in protection..."
  local ASG_INSTANCE_IDS
  ASG_INSTANCE_IDS=$(get_asg_instance_ids)

  if [ -n "$ASG_INSTANCE_IDS" ] && [ "$ASG_INSTANCE_IDS" != "None" ]; then
    for IID in $ASG_INSTANCE_IDS; do
      echo "    Removing protection from $IID..."
      aws autoscaling set-instance-protection \
        --instance-ids "$IID" \
        --auto-scaling-group-name "$ASG" \
        --no-protected-from-scale-in \
        --region "$REGION" || true
    done
  fi

  # 6. Set ASG desired capacity to 0
  echo ">>> Setting ASG desired capacity to 0..."
  aws autoscaling set-desired-capacity \
    --auto-scaling-group-name "$ASG" \
    --desired-capacity 0 \
    --region "$REGION"

  # 7. Wait for instances to actually terminate
  #    Force-terminates via EC2 API if stuck in lifecycle hooks after 90s
  wait_for_clean_asg 300 90

  echo ""
  echo "=== GPU instance stopped ==="
  echo "All GPU resources terminated. Cost accrual stopped."
}

# =============================================================
# STATUS
# =============================================================
gpu_status() {
  echo "=== GPU Forensics Status ==="
  echo ""

  # ASG status
  echo "--- Auto Scaling Group ---"
  aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-names "$ASG" \
    --region "$REGION" \
    --query 'AutoScalingGroups[0].{DesiredCapacity:DesiredCapacity,MinSize:MinSize,MaxSize:MaxSize,Instances:Instances[*].{Id:InstanceId,State:LifecycleState,Health:HealthStatus}}' \
    --output table 2>/dev/null || echo "  ASG not found"

  echo ""

  # ECS service status
  echo "--- ECS GPU Service ---"
  aws ecs describe-services \
    --cluster "$CLUSTER" \
    --services "$SERVICE" \
    --region "$REGION" \
    --query 'services[0].{DesiredCount:desiredCount,RunningCount:runningCount,PendingCount:pendingCount,Status:status}' \
    --output table 2>/dev/null || echo "  Service not found"

  echo ""

  # Container instances
  echo "--- ECS Container Instances ---"
  local CI_ARNS
  CI_ARNS=$(aws ecs list-container-instances \
    --cluster "$CLUSTER" --region "$REGION" \
    --query 'containerInstanceArns[]' --output text 2>/dev/null || echo "")
  if [ -n "$CI_ARNS" ] && [ "$CI_ARNS" != "None" ]; then
    aws ecs describe-container-instances \
      --cluster "$CLUSTER" \
      --container-instances $CI_ARNS \
      --region "$REGION" \
      --query 'containerInstances[*].{Id:ec2InstanceId,Status:status,Running:runningTasksCount,Pending:pendingTasksCount}' \
      --output table 2>/dev/null || echo "  Error fetching container instances"
  else
    echo "  No container instances registered"
  fi

  echo ""

  # Target group health
  echo "--- GPU Target Group Health ---"
  local TG_ARN
  TG_ARN=$(aws elbv2 describe-target-groups \
    --names "$GPU_TG_NAME" \
    --region "$REGION" \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text 2>/dev/null || echo "")

  if [ -n "$TG_ARN" ] && [ "$TG_ARN" != "None" ]; then
    aws elbv2 describe-target-health \
      --target-group-arn "$TG_ARN" \
      --region "$REGION" \
      --query 'TargetHealthDescriptions[*].{Target:Target.Id,Port:Target.Port,State:TargetHealth.State,Reason:TargetHealth.Reason}' \
      --output table 2>/dev/null || echo "  No targets registered"
  else
    echo "  Target group not found"
  fi

  echo ""

  # ALB weights
  echo "--- ALB Routing Weights ---"
  local ALB_ARN
  ALB_ARN=$(aws elbv2 describe-load-balancers \
    --names "$ALB_NAME" --region "$REGION" \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || echo "")
  if [ -n "$ALB_ARN" ] && [ "$ALB_ARN" != "None" ]; then
    local LISTENER_ARN
    LISTENER_ARN=$(aws elbv2 describe-listeners \
      --load-balancer-arn "$ALB_ARN" --region "$REGION" \
      --query "Listeners[?Port==\`443\`].ListenerArn" --output text 2>/dev/null || echo "")
    if [ -n "$LISTENER_ARN" ] && [ "$LISTENER_ARN" != "None" ]; then
      aws elbv2 describe-rules \
        --listener-arn "$LISTENER_ARN" --region "$REGION" \
        --query "Rules[?Priority=='200'].Actions[0].ForwardConfig.TargetGroups[*].{ARN:TargetGroupArn,Weight:Weight}" \
        --output table 2>/dev/null || echo "  Could not fetch ALB rule"
    fi
  fi

  echo ""
}

# =============================================================
# Run
# =============================================================
case "$ACTION" in
  on)
    gpu_on
    ;;
  off)
    gpu_off
    ;;
  status)
    gpu_status
    ;;
  *)
    echo "Usage: AWS_PROFILE=banyan bash scripts/forensics-gpu.sh [on|off|status]"
    exit 1
    ;;
esac
