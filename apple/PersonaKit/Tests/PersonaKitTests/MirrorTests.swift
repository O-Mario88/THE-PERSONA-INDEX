import Foundation
import Testing
@testable import PersonaKit

@Suite("The weekly mirror")
struct MirrorTests {
    private func fixture() throws -> Data {
        try Data(contentsOf: try #require(Bundle.module.url(forResource: "mirror", withExtension: "json", subdirectory: "Fixtures")))
    }

    @Test("decodes a week as the server sends it")
    func decodes() throws {
        let m = try JSONDecoder().decode(WeekMirror.self, from: try fixture())
        #expect(m.week == 42)
        #expect(m.stats.daysActive == 5)
        #expect(m.stats.answers == 18)
        #expect(m.days.count == 7)
        #expect(m.traits.first?.trait == "conscientiousness")
        #expect(m.traits.first?.level == .steady)
    }

    @Test("says how far a read is earned, never as a verdict")
    func levelLine() throws {
        let m = try JSONDecoder().decode(WeekMirror.self, from: try fixture())
        let read = try #require(m.traits.first)
        #expect(read.levelLine == "Steady · 14 answers")
        #expect(Traits.all[read.trait]?.name == "Getting things done")
    }
}
