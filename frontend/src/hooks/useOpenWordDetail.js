import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { vocabularyDetailPath } from "../lib/wordRoutes.js";

export function useOpenWordDetail() {
    const navigate = useNavigate();
    return useCallback(
        (vocab) => {
            const id = typeof vocab === "string" ? vocab : vocab?.id;
            if (id) navigate(vocabularyDetailPath(id));
        },
        [navigate],
    );
}
