import Foundation

/// Theme names and icons, from frontend/src/themes.ts (kept in step by hand; the
/// keys match backend/content.go).
public enum Themes {
    public struct Style: Sendable, Hashable {
        public let name: String
        public let icon: String
    }

    public static let all: [String: Style] = [
        "habits": Style(name: "Daily habits", icon: "☀️"),
        "sleep-health": Style(name: "Sleep and health", icon: "🌙"),
        "money": Style(name: "Money", icon: "💰"),
        "work-career": Style(name: "Work and career", icon: "💼"),
        "learning": Style(name: "Learning", icon: "📚"),
        "school": Style(name: "School and studying", icon: "🎒"),
        "home": Style(name: "Home", icon: "🧺"),
        "food": Style(name: "Food and eating", icon: "🍲"),
        "phone": Style(name: "Phone and screens", icon: "📱"),
        "getting-around": Style(name: "Getting around", icon: "🚌"),
        "body": Style(name: "Body and looks", icon: "🪞"),
        "friendship": Style(name: "Friendship", icon: "🤝"),
        "family": Style(name: "Family", icon: "🏡"),
        "relatives": Style(name: "Relatives", icon: "🌳"),
        "parenting": Style(name: "Children and parenting", icon: "🧸"),
        "partnership": Style(name: "Partnership", icon: "💞"),
        "dating": Style(name: "Dating", icon: "💌"),
        "neighbours": Style(name: "Neighbours", icon: "🏘️"),
        "colleagues": Style(name: "Colleagues", icon: "👥"),
        "helping": Style(name: "Helping others", icon: "🤲"),
        "happiness": Style(name: "Happiness", icon: "😊"),
        "sadness-stress": Style(name: "Sadness and stress", icon: "🌧️"),
        "anger": Style(name: "Anger", icon: "🔥"),
        "honesty": Style(name: "Honesty", icon: "🧭"),
        "faith": Style(name: "Faith and meaning", icon: "🕊️"),
        "confidence": Style(name: "Confidence", icon: "🌟"),
        "quality-quantity": Style(name: "Quality or quantity", icon: "⚖️"),
        "wealth-luxury": Style(name: "Wealth and luxury", icon: "💎"),
        "ambition-desire": Style(name: "Ambition and heart's desire", icon: "🚀"),
        "celebrations": Style(name: "Celebrations", icon: "🎉"),
        "plans": Style(name: "Plans and dreams", icon: "🗺️"),
        "rest": Style(name: "Rest and free time", icon: "🛋️"),
        "intimacy": Style(name: "Intimacy", icon: "🌹"),
    ]

    public static func style(_ theme: String?) -> Style {
        theme.flatMap { all[$0] } ?? Style(name: "Today", icon: "☀️")
    }
}
