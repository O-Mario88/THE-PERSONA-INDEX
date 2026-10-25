import Foundation

/// A card's reveal, as the web shows it: the first sentence is the headline,
/// the rest the body (frontend/src/reveal.ts).
public enum Reveal {
    public static func split(_ reveal: String) -> (headline: String, body: String) {
        let ends: Set<Character> = [".", "!", "?"]
        var index = reveal.startIndex
        while index < reveal.endIndex {
            let next = reveal.index(after: index)
            if ends.contains(reveal[index]), next < reveal.endIndex, reveal[next].isWhitespace {
                let headline = String(reveal[...index])
                let body = reveal[next...].trimmingCharacters(in: .whitespacesAndNewlines)
                if !body.isEmpty { return (headline, body) }
            }
            index = next
        }
        return (reveal, "")
    }
}
