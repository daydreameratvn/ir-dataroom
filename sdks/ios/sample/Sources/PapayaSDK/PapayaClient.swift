import Foundation

/// Configuration for the Papaya SDK
public struct PapayaConfig {
    public let apiKey: String
    public let baseURL: URL
    public let timeout: TimeInterval
    
    public init(
        apiKey: String,
        baseURL: URL = URL(string: "https://api.papaya.ai/v1")!,
        timeout: TimeInterval = 30
    ) {
        self.apiKey = apiKey
        self.baseURL = baseURL
        self.timeout = timeout
    }
}

/// Main entry point for the Papaya SDK
public final class PapayaClient {
    private let config: PapayaConfig
    private let session: URLSession
    
    public init(config: PapayaConfig) {
        self.config = config
        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.timeoutIntervalForRequest = config.timeout
        self.session = URLSession(configuration: sessionConfig)
    }
    
    /// Fetch a claim by ID
    public func getClaim(id: String) async throws -> ClaimData {
        return try await request(path: "/claims/\(id)")
    }
    
    /// List claims with pagination
    public func listClaims(page: Int = 1, pageSize: Int = 20) async throws -> PaginatedResponse<ClaimData> {
        return try await request(path: "/claims?page=\(page)&pageSize=\(pageSize)")
    }
    
    private func request<T: Decodable>(path: String) async throws -> T {
        var urlRequest = URLRequest(url: config.baseURL.appendingPathComponent(path))
        urlRequest.addValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")
        urlRequest.addValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let (data, response) = try await session.data(for: urlRequest)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw PapayaError.invalidResponse
        }
        
        guard (200...299).contains(httpResponse.statusCode) else {
            throw PapayaError.apiError(statusCode: httpResponse.statusCode)
        }
        
        return try JSONDecoder().decode(T.self, from: data)
    }
}

public struct ClaimData: Codable, Sendable {
    public let id: String
    public let claimId: String
    public let status: String
    public let amount: Double
    public let currency: String
    public let submittedAt: String
}

public struct PaginatedResponse<T: Codable>: Codable where T: Sendable {
    public let data: [T]
    public let total: Int
}

public enum PapayaError: Error {
    case invalidResponse
    case apiError(statusCode: Int)
}
