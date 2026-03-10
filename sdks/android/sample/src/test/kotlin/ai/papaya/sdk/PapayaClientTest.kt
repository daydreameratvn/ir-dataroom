package ai.papaya.sdk

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class PapayaConfigTest {
    @Test
    fun `creates config with default values`() {
        val config = PapayaConfig(apiKey = "test-key")
        assertEquals("test-key", config.apiKey)
        assertEquals("https://api.papaya.ai/v1", config.baseUrl)
        assertEquals(30_000L, config.timeoutMs)
    }

    @Test
    fun `creates config with custom values`() {
        val config = PapayaConfig(
            apiKey = "custom-key",
            baseUrl = "https://custom.api.com/v2",
            timeoutMs = 60_000
        )
        assertEquals("custom-key", config.apiKey)
        assertEquals("https://custom.api.com/v2", config.baseUrl)
        assertEquals(60_000L, config.timeoutMs)
    }

    @Test
    fun `serializes and deserializes config`() {
        val config = PapayaConfig(apiKey = "test-key")
        val json = Json.encodeToString(config)
        val decoded = Json.decodeFromString<PapayaConfig>(json)
        assertEquals(config, decoded)
    }
}

class ClaimDataTest {
    private val sampleClaim = ClaimData(
        id = "1",
        claimId = "CLM-001",
        status = "submitted",
        amount = 1500.0,
        currency = "USD",
        submittedAt = "2026-03-10T00:00:00Z"
    )

    @Test
    fun `creates claim data with all fields`() {
        assertEquals("CLM-001", sampleClaim.claimId)
        assertEquals("submitted", sampleClaim.status)
        assertEquals(1500.0, sampleClaim.amount)
        assertEquals("USD", sampleClaim.currency)
    }

    @Test
    fun `serializes and deserializes claim data`() {
        val json = Json.encodeToString(sampleClaim)
        val decoded = Json.decodeFromString<ClaimData>(json)
        assertEquals(sampleClaim, decoded)
    }

    @Test
    fun `deserializes claim from JSON string`() {
        val json = """
            {
                "id": "2",
                "claimId": "CLM-002",
                "status": "approved",
                "amount": 2500.50,
                "currency": "SGD",
                "submittedAt": "2026-03-09T12:00:00Z"
            }
        """.trimIndent()
        val claim = Json.decodeFromString<ClaimData>(json)
        assertEquals("CLM-002", claim.claimId)
        assertEquals("approved", claim.status)
        assertEquals(2500.50, claim.amount)
        assertEquals("SGD", claim.currency)
    }
}

class FWAAlertDataTest {
    private val sampleAlert = FWAAlertData(
        id = "1",
        alertId = "FWA-001",
        severity = "high",
        score = 0.95,
        description = "Duplicate claim detected",
        detectedAt = "2026-03-10T00:00:00Z"
    )

    @Test
    fun `creates alert data with all fields`() {
        assertEquals("FWA-001", sampleAlert.alertId)
        assertEquals("high", sampleAlert.severity)
        assertEquals(0.95, sampleAlert.score)
        assertEquals("Duplicate claim detected", sampleAlert.description)
    }

    @Test
    fun `serializes and deserializes alert data`() {
        val json = Json.encodeToString(sampleAlert)
        val decoded = Json.decodeFromString<FWAAlertData>(json)
        assertEquals(sampleAlert, decoded)
    }

    @Test
    fun `deserializes alert from JSON string`() {
        val json = """
            {
                "id": "2",
                "alertId": "FWA-002",
                "severity": "low",
                "score": 0.3,
                "description": "Minor anomaly",
                "detectedAt": "2026-03-09T08:00:00Z"
            }
        """.trimIndent()
        val alert = Json.decodeFromString<FWAAlertData>(json)
        assertEquals("FWA-002", alert.alertId)
        assertEquals("low", alert.severity)
        assertEquals(0.3, alert.score)
    }
}

class PapayaClientTest {
    @Test
    fun `creates client with config`() {
        val config = PapayaConfig(apiKey = "test-key")
        val client = PapayaClient(config)
        // Client should instantiate without errors
        assertNotNull(client)
    }
}
