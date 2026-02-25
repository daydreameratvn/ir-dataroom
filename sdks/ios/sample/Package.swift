// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "PapayaSDK",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "PapayaSDK", targets: ["PapayaSDK"]),
    ],
    targets: [
        .target(name: "PapayaSDK", path: "Sources/PapayaSDK"),
        .testTarget(name: "PapayaSDKTests", dependencies: ["PapayaSDK"]),
    ]
)
