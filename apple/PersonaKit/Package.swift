// swift-tools-version: 6.0
// PersonaKit: everything the native apps share that has no screens: the
// models, the client for the Go API, what is kept on the device, and the
// day's five windows. Tested with `swift test` on the Mac.

import PackageDescription

let package = Package(
    name: "PersonaKit",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "PersonaKit", targets: ["PersonaKit"]),
    ],
    targets: [
        .target(name: "PersonaKit"),
        .testTarget(
            name: "PersonaKitTests",
            dependencies: ["PersonaKit"],
            resources: [.copy("Fixtures")]
        ),
    ]
)
