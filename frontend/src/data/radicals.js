// Dữ liệu tĩnh cho trang Bộ thủ — chỉ giữ Quy tắc thuận bút (nội dung giảng dạy).
// 214 bộ thủ giờ được lấy từ DB qua GET /api/radicals (DB là nguồn duy nhất).

export const strokeOrderRules = [
    {
        rule: "Trên trước, dưới sau",
        zh: "从上到下",
        desc: "Viết từ trên xuống dưới, phần trên xong mới đến phần dưới.",
        char: "六",
    },
    {
        rule: "Trái trước, phải sau",
        zh: "从左到右",
        desc: "Viết từ trái sang phải, bộ phận bên trái xong mới sang bên phải.",
        char: "行",
    },
    {
        rule: "Ngang trước, sổ sau",
        zh: "先横后竖",
        desc: "Gặp nét ngang và nét sổ giao nhau thì viết nét ngang trước.",
        char: "干",
    },
    {
        rule: "Phẩy trước, mác sau",
        zh: "先撇后捺",
        desc: "Nét phẩy (丿) viết trước, nét mác (乀) viết sau.",
        char: "父",
    },
    {
        rule: "Ngoài trước, trong sau",
        zh: "先外后内",
        desc: "Khung ngoài viết trước rồi mới viết phần bên trong.",
        char: "月",
    },
    {
        rule: "Vào nhà trước, đóng cửa sau",
        zh: "先里头后封口",
        desc: "Chữ có khung kín: viết khung → phần trong → nét đóng đáy sau cùng.",
        char: "固",
    },
    {
        rule: "Giữa trước, hai bên sau",
        zh: "先中间后两边",
        desc: "Nét giữa nổi bật, hai bên đối xứng: viết nét giữa trước.",
        char: "小",
    },
];

export const strokeOrderNote = {
    text: "Bộ 辶 (sước), 廴 (dẫn), 凵 (khảm) luôn viết SAU CÙNG",
    chars: ["逃", "廷", "凶"],
};
