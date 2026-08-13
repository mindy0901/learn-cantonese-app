-- Merge vocabulary_meanings + vocabulary_examples into vocabularies.meanings_json
-- Shape: { meanings: [{id, category, vietMeanings, engMeanings, position, examples:[...]}], examples: [...] }
-- Run once, BEFORE dropping the child tables.

UPDATE vocabularies v
SET meanings_json = jsonb_build_object(
    'meanings', COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', vm.id,
                    'category', COALESCE(vm.category, ''),
                    'vietMeanings', COALESCE(vm.viet_meanings, ''),
                    'engMeanings', COALESCE(vm.eng_meanings, ''),
                    'position', vm.position,
                    'examples', COALESCE(
                        (
                            SELECT jsonb_agg(
                                jsonb_build_object(
                                    'id', ve.id,
                                    'hanExample', COALESCE(ve.han_example, ''),
                                    'jyutpingExample', COALESCE(ve.jyutping_example, ''),
                                    'pinyinExample', COALESCE(ve.pinyin_example, ''),
                                    'vietExamples', COALESCE(ve.viet_examples, ''),
                                    'engExamples', COALESCE(ve.eng_examples, ''),
                                    'position', ve.position
                                ) ORDER BY ve.position
                            ) FROM vocabulary_examples ve WHERE ve.meaning_id = vm.id
                        ), '[]'::jsonb
                    )
                ) ORDER BY vm.position
            ) FROM vocabulary_meanings vm WHERE vm.vocabulary_id = v.id
        ), '[]'::jsonb
    ),
    'examples', COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', ve.id,
                    'hanExample', COALESCE(ve.han_example, ''),
                    'jyutpingExample', COALESCE(ve.jyutping_example, ''),
                    'pinyinExample', COALESCE(ve.pinyin_example, ''),
                    'vietExamples', COALESCE(ve.viet_examples, ''),
                    'engExamples', COALESCE(ve.eng_examples, ''),
                    'position', ve.position
                ) ORDER BY ve.position
            ) FROM vocabulary_examples ve WHERE ve.vocabulary_id = v.id AND ve.meaning_id IS NULL
        ), '[]'::jsonb
    )
)
WHERE EXISTS (SELECT 1 FROM vocabulary_meanings vm WHERE vm.vocabulary_id = v.id)
   OR EXISTS (SELECT 1 FROM vocabulary_examples ve WHERE ve.vocabulary_id = v.id);
