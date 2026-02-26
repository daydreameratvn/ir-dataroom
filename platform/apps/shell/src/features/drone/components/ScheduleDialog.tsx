import { useState, useEffect } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@papaya/shared-ui';
import type { DroneSchedule, DroneTier } from '../types';
import { createSchedule, updateSchedule, type CreateSchedulePayload } from '../api';

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule?: DroneSchedule | null;
  onSaved: () => void;
}

const CRON_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 4 hours', value: '0 */4 * * *' },
  { label: 'Daily 9am', value: '0 9 * * *' },
  { label: 'Weekdays 9am', value: '0 9 * * 1-5' },
  { label: 'Custom', value: 'custom' },
] as const;

export default function ScheduleDialog({
  open,
  onOpenChange,
  schedule,
  onSaved,
}: ScheduleDialogProps) {
  const isEditing = Boolean(schedule);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tier, setTier] = useState<DroneTier>(1);
  const [batchSize, setBatchSize] = useState(10);
  const [cronExpression, setCronExpression] = useState('0 9 * * 1-5');
  const [cronPreset, setCronPreset] = useState('0 9 * * 1-5');
  const [slackChannel, setSlackChannel] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate fields when editing
  useEffect(() => {
    if (schedule) {
      setName(schedule.name);
      setDescription(schedule.description);
      setTier(schedule.tier);
      setBatchSize(schedule.batchSize);
      setCronExpression(schedule.cronExpression);
      setSlackChannel(schedule.slackChannel ?? '');

      const matchingPreset = CRON_PRESETS.find((p) => p.value === schedule.cronExpression);
      setCronPreset(matchingPreset ? matchingPreset.value : 'custom');
    } else {
      setName('');
      setDescription('');
      setTier(1);
      setBatchSize(10);
      setCronExpression('0 9 * * 1-5');
      setCronPreset('0 9 * * 1-5');
      setSlackChannel('');
    }
    setError(null);
  }, [schedule, open]);

  function handleCronPresetChange(value: string) {
    setCronPreset(value);
    if (value !== 'custom') {
      setCronExpression(value);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const payload: CreateSchedulePayload = {
        name: name.trim(),
        description: description.trim() || undefined,
        tier,
        batchSize,
        cronExpression,
        slackChannel: slackChannel.trim() || undefined,
      };

      if (isEditing && schedule) {
        await updateSchedule(schedule.id, payload);
      } else {
        await createSchedule(payload);
      }

      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Schedule' : 'New Schedule'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Name <span className="text-red-500">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Morning Tier 1 batch"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
            />
          </div>

          {/* Tier */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tier</label>
            <Select
              value={String(tier)}
              onValueChange={(v) => setTier(Number(v) as DroneTier)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Tier 1 - Auto-adjudication</SelectItem>
                <SelectItem value="2">Tier 2 - Assisted review</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Batch Size */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Batch Size</label>
            <Input
              type="number"
              min={1}
              max={500}
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
            />
          </div>

          {/* Cron Expression */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Schedule</label>
            <Select value={cronPreset} onValueChange={handleCronPresetChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRON_PRESETS.map((preset) => (
                  <SelectItem key={preset.value} value={preset.value}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cronPreset === 'custom' && (
              <Input
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="e.g. 0 */6 * * *"
                className="mt-1.5 font-mono text-sm"
              />
            )}
            <p className="text-xs text-muted-foreground">
              Cron: {cronExpression}
            </p>
          </div>

          {/* Slack Channel */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Slack Channel (optional)</label>
            <Input
              value={slackChannel}
              onChange={(e) => setSlackChannel(e.target.value)}
              placeholder="e.g. #drone-alerts"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : isEditing ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
