import CoreGraphics
import Testing
@testable import PersonaKit

/// Chips in rows: as many to a row as fit, and none wider than the row.
@Suite("Wrapping rows")
struct WrapTests {
    /// Items of a fixed natural size that shrink to the room they're given,
    /// growing taller as text does when it wraps.
    func measure(_ natural: [CGSize]) -> (Int, CGFloat) -> CGSize {
        { i, room in
            let n = natural[i]
            guard n.width > room else { return n }
            let lines = (n.width / room).rounded(.up)
            return CGSize(width: room, height: n.height * lines)
        }
    }

    @Test("puts items side by side until the row is full, then starts a new row")
    func rows() {
        let sizes = [CGSize(width: 40, height: 20), CGSize(width: 40, height: 20), CGSize(width: 40, height: 30)]
        let w = Wrap.layout(count: 3, width: 100, spacing: 8, measure: measure(sizes))
        #expect(w.frames == [CGRect(x: 0, y: 0, width: 40, height: 20),
                             CGRect(x: 48, y: 0, width: 40, height: 20),
                             CGRect(x: 0, y: 28, width: 40, height: 30)])
        #expect(w.size == CGSize(width: 88, height: 58))
    }

    @Test("an item wider than the row gets the whole row and wraps inside it")
    func tooWide() {
        let sizes = [CGSize(width: 30, height: 20), CGSize(width: 250, height: 20), CGSize(width: 30, height: 20)]
        let w = Wrap.layout(count: 3, width: 100, spacing: 8, measure: measure(sizes))
        #expect(w.frames[1] == CGRect(x: 0, y: 28, width: 100, height: 60))
        #expect(w.frames[2] == CGRect(x: 0, y: 96, width: 30, height: 20))
        #expect(w.frames.allSatisfy { $0.maxX <= 100 })
        #expect(w.size == CGSize(width: 100, height: 116))
    }

    @Test("with no limit, everything sits on one row")
    func unlimited() {
        let sizes = [CGSize(width: 30, height: 20), CGSize(width: 250, height: 20)]
        let w = Wrap.layout(count: 2, width: .infinity, spacing: 8, measure: measure(sizes))
        #expect(w.frames.map(\.minY) == [0, 0])
        #expect(w.size == CGSize(width: 288, height: 20))
    }

    @Test("nothing to place takes no room")
    func empty() {
        let w = Wrap.layout(count: 0, width: 100, spacing: 8, measure: { _, _ in .zero })
        #expect(w.frames.isEmpty)
        #expect(w.size == .zero)
    }
}
