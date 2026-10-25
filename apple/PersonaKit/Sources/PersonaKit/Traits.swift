import Foundation

/// Trait names and the two ends of each, from frontend/src/traits.ts (the
/// keys match backend/content.go). Used to name a read; never a verdict.
public enum Traits {
    public struct Side: Sendable, Hashable {
        public let lean: String
        public let headline: String
    }

    public struct Trait: Sendable, Hashable {
        public let name: String
        public let high: Side
        public let low: Side
    }

    public static let all: [String: Trait] = [
        "conscientiousness": Trait(name: "Getting things done", high: Side(lean: "getting things done", headline: "You finish what you start."), low: Side(lean: "keeping plans loose", headline: "You keep your plans loose.")),
        "agreeableness": Trait(name: "Keeping the peace", high: Side(lean: "keeping the peace", headline: "You keep the peace."), low: Side(lean: "saying what you think", headline: "You say what you think.")),
        "openness": Trait(name: "Openness to new things", high: Side(lean: "trying new things", headline: "You reach for the new."), low: Side(lean: "sticking with what works", headline: "You trust what works.")),
        "extraversion": Trait(name: "Energy from people", high: Side(lean: "time with people", headline: "People charge you up."), low: Side(lean: "time on your own", headline: "You recharge on your own.")),
        "neuroticism": Trait(name: "Worry and tension", high: Side(lean: "worry", headline: "Things stay with you."), low: Side(lean: "staying calm", headline: "Setbacks roll off you.")),
        "honesty_humility": Trait(name: "Fairness", high: Side(lean: "playing fair", headline: "You play fair, even unseen."), low: Side(lean: "bending the rules", headline: "You treat rules as flexible.")),
        "attachment_anxiety": Trait(name: "Reading closeness", high: Side(lean: "watching for distance", headline: "You notice distance fast."), low: Side(lean: "trusting the quiet", headline: "Silence doesn't rattle you.")),
        "attachment_avoidance": Trait(name: "Keeping space", high: Side(lean: "keeping your space", headline: "You keep a little space."), low: Side(lean: "letting people in", headline: "You let people in.")),
        "present_bias": Trait(name: "Now versus later", high: Side(lean: "now over later", headline: "Now tends to win."), low: Side(lean: "waiting for better", headline: "You'll wait for better.")),
        "rumination": Trait(name: "Replaying", high: Side(lean: "replaying hard moments", headline: "You replay hard moments."), low: Side(lean: "letting things go", headline: "You let things go.")),
        "materialism": Trait(name: "Things or experiences", high: Side(lean: "owning things", headline: "Owning things matters to you."), low: Side(lean: "doing over owning", headline: "You'd rather do than own.")),
    ]
}
