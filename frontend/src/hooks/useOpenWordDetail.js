import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { vocabularyDetailPath } from "../lib/wordRoutes.js";

export function useOpenWordDetail() {
    const navigate = useNavigate();
    return useCallback(
        (vocab) => {
            const han =
                typeof vocab === "string" ? vocab : vocab?.hanSimplified || vocab?.hanHongKong || vocab?.hanTraditional;
            if (han) navigate(vocabularyDetailPath(han));
        },
        [navigate],
    );
}
