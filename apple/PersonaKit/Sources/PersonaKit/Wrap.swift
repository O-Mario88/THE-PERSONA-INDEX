import CoreGraphics

/// Chips and pills in rows: as many to a row as fit, then a new row. An item
/// wider than a row gets the whole row, so its words wrap inside it rather
/// than running off the edge (large text sizes, long theme names).
public enum Wrap {
    public struct Placed: Equatable, Sendable {
        public let frames: [CGRect]
        public let size: CGSize
    }

    /// `measure(i, room)` is item i's size when it may be at most `room` wide.
    public static func layout(count: Int, width: CGFloat, spacing: CGFloat,
                              measure: (Int, CGFloat) -> CGSize) -> Placed {
        var frames: [CGRect] = []
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0, widest: CGFloat = 0
        for i in 0..<count {
            let s = measure(i, width)
            if x > 0, x + s.width > width {
                x = 0
                y += row + spacing
                row = 0
            }
            frames.append(CGRect(origin: CGPoint(x: x, y: y), size: s))
            widest = max(widest, x + s.width)
            x += s.width + spacing
            row = max(row, s.height)
        }
        return Placed(frames: frames, size: CGSize(width: widest, height: y + row))
    }
}
