import CoreText
import SwiftUI

// The design tokens of frontend/DESIGN.md, for SwiftUI: white and ink in
// light, navy in dark, one lime accent that only ever fills (under dark
// ink), and Figtree at heavy weights. Change a value here, never in a view.

#if canImport(UIKit)
import UIKit
private typealias PlatformColor = UIColor
#else
import AppKit
private typealias PlatformColor = NSColor
#endif

extension Color {
    /// A colour that follows light and dark mode.
    init(light: UInt32, dark: UInt32) {
        func make(_ hex: UInt32) -> PlatformColor {
            PlatformColor(
                red: CGFloat((hex >> 16) & 0xFF) / 255,
                green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255,
                alpha: 1
            )
        }
        #if canImport(UIKit)
        self.init(uiColor: UIColor { $0.userInterfaceStyle == .dark ? make(dark) : make(light) })
        #else
        self.init(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? make(dark) : make(light)
        })
        #endif
    }

    init(hex: UInt32) { self.init(light: hex, dark: hex) }
}

enum Palette {
    static let bg = Color(light: 0xFFFFFF, dark: 0x0E1B26)
    static let surface = Color(light: 0xFFFFFF, dark: 0x13222F)
    static let surface2 = Color(light: 0xF3F5F7, dark: 0x1A2B3A)
    static let surface3 = Color(light: 0xE9EDF0, dark: 0x223546)
    static let line = Color(light: 0xE7EAEE, dark: 0x22344A)
    static let lineStrong = Color(light: 0xD3D9DF, dark: 0x2F4459)
    static let text = Color(light: 0x0E1A24, dark: 0xF4F7F9)
    static let text2 = Color(light: 0x3E4B57, dark: 0xC3CDD6)
    static let muted = Color(light: 0x64707C, dark: 0x93A1AE)
    static let lime = Color(hex: 0xC6F24E)
    static let limeStrong = Color(hex: 0xB5E636)
    static let onLime = Color(hex: 0x0E1A24)
    static let accentInk = Color(light: 0x2F6D10, dark: 0xC6F24E)
    static let accentWash = Color(light: 0xF4FBE2, dark: 0x1D2F2B)
    static let accentLine = Color(light: 0xB9E44A, dark: 0xC6F24E)
    static let navy = Color(light: 0x0E1B26, dark: 0x13222F)
    static let onNavy = Color(hex: 0xF4F7F9)
    static let onNavy2 = Color(hex: 0xC3CDD6)
    static let danger = Color(light: 0xB42318, dark: 0xFF8A7A)
}

enum Space {
    static let s1: CGFloat = 4
    static let s2: CGFloat = 8
    static let s3: CGFloat = 12
    static let s4: CGFloat = 16
    static let s5: CGFloat = 20
    static let s6: CGFloat = 24
    static let s8: CGFloat = 32
    static let gutter: CGFloat = 24
}

enum Radius {
    static let sm: CGFloat = 10
    static let md: CGFloat = 14
    static let lg: CGFloat = 18
    static let xl: CGFloat = 24
}

// MARK: Type

enum Figtree {
    /// The static weights bundled in Resources/Fonts (made from the OFL
    /// variable font; the licence is beside them).
    static func name(_ weight: Font.Weight) -> String {
        switch weight {
        case .black: "Figtree-Black"
        case .heavy: "Figtree-ExtraBold"
        case .bold: "Figtree-Bold"
        case .semibold: "Figtree-SemiBold"
        case .medium: "Figtree-Medium"
        default: "Figtree-Regular"
        }
    }
}

extension Font {
    /// Figtree at a size, scaling with Dynamic Type relative to a text style.
    static func figtree(_ size: CGFloat, _ weight: Font.Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom(Figtree.name(weight), size: size, relativeTo: style)
    }

    static let pHero = figtree(34, .heavy, relativeTo: .largeTitle)
    static let pTitle = figtree(28, .heavy, relativeTo: .title)
    static let pH2 = figtree(20, .heavy, relativeTo: .title3)
    static let pH3 = figtree(17, .bold, relativeTo: .headline)
    static let pBody = figtree(16, .regular, relativeTo: .body)
    static let pSmall = figtree(14, .regular, relativeTo: .subheadline)
    static let pLabel = figtree(12, .bold, relativeTo: .caption)
    static let pButton = figtree(17, .heavy, relativeTo: .headline)
}
