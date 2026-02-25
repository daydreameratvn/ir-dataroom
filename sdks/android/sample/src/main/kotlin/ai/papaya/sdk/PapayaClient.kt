package ai.papaya.sdk

import kotlinx.serialization.Serializable

@Serializable
data class PapayaConfig(
    val apiKey: String,
    val baseUrl: String = "https://api.papaya.ai/v1",
    val timeoutMs: Long = 30_000
)

@Serializable
data class ClaimData(
    val id: String,
    val claimId: String,
    val status: String,
    val amount: Double,
    val currency: String,
    val submittedAt: String
)

@Serializable
data class FWAAlertData(
    val id: String,
    val alertId: String,
    val severity: String,
    val score: Double,
    val description: String,
    val detectedAt: String
)

/**
 * Main entry point for the Papaya Android SDK.
 */
class PapayaClient(private val config: PapayaConfig) {
    // TODO: Implement HTTP client using Ktor
    // suspend fun getClaim(claimId: String): ClaimData
    // suspend fun listClaims(page: Int = 1, pageSize: Int = 20): List<ClaimData>
    // suspend fun getFWAAlert(alertId: String): FWAAlertData
    // suspend fun listFWAAlerts(page: Int = 1, pageSize: Int = 20): List<FWAAlertData>
}
