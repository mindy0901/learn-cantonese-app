/**
 * Biểu đồ thanh điệu Jyutping (SVG) — đường nét (contour) theo thang 5 bậc.
 * Giống biểu đồ trên Open Cantonese: dòng kẻ ngang + mũi tên chỉ hướng giọng.
 */
const CONTOURS = {
    1: { x1: 10, y1: 14, x2: 50, y2: 14 }, // Cao và đều (55)
    2: { x1: 10, y1: 26, x2: 50, y2: 12 }, // Cao vút lên (35)
    3: { x1: 10, y1: 28, x2: 50, y2: 28 }, // Trung bình (33)
    4: { x1: 10, y1: 30, x2: 50, y2: 46 }, // Thấp xuống (21)
    5: { x1: 10, y1: 46, x2: 50, y2: 32 }, // Thấp rồi lên (23)
    6: { x1: 10, y1: 44, x2: 50, y2: 44 }, // Thấp và bằng (22)
};

export function ToneDiagram({ tone, className = "" }) {
    const c = CONTOURS[tone] ?? CONTOURS[1];
    const dx = c.x2 - c.x1;
    const dy = c.y2 - c.y1;
    const len = Math.hypot(dx, dy) || 1;
    // Điểm mũi tên
    const ux = dx / len;
    const uy = dy / len;
    const tipX = c.x2 - ux * 6;
    const tipY = c.y2 - uy * 6;
    const ang = Math.atan2(dy, dx);
    const s = 5;
    const ax1 = tipX - s * Math.cos(ang - Math.PI / 6);
    const ay1 = tipY - s * Math.sin(ang - Math.PI / 6);
    const ax2 = tipX - s * Math.cos(ang + Math.PI / 6);
    const ay2 = tipY - s * Math.sin(ang + Math.PI / 6);

    return (
        <svg viewBox="0 0 60 60" className={className} width="72" height="72" role="img" aria-label={`Tone ${tone}`}>
            {/* Dòng kẻ thang 5 bậc */}
            {[15, 22.5, 30, 37.5, 45].map((y) => (
                <line
                    key={y}
                    x1="6"
                    y1={y}
                    x2="54"
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity="0.25"
                    strokeWidth="0.8"
                />
            ))}
            {/* Đường nét giọng */}
            <line
                x1={c.x1}
                y1={c.y1}
                x2={tipX}
                y2={tipY}
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
            />
            <polygon points={`${c.x2},${c.y2} ${ax1},${ay1} ${ax2},${ay2}`} fill="currentColor" />
        </svg>
    );
}
