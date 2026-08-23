# Kế hoạch triển khai WenetSpeech-Yue — App học Cantonese

> Ngày: 2026-08-22 · Trạng thái: **chưa triển khai (plan)**
> Nguồn: https://github.com/ASLP-lab/WenetSpeech-Yue (Apache-2.0) · Paper: https://arxiv.org/abs/2509.03959

## 1. Tóm tắt repo

Kho dữ liệu giọng nói Quảng Đông **21.800 giờ** (lớn nhất open-source) + model ASR/TTS + pipeline tiền xử lý.

| Thành phần           | Nội dung                                                                                                                                    | Model / Link                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Dataset**          | 21.800h audio + transcript, timestamp từng ký tự, SNR/DNSMOS, speaker, tuổi/giới tính, 10 domain (news, drama, podcast, vlog, education...) | HuggingFace: `ASLP-lab/WenetSpeech-Yue`                                           |
| **ASR** (nghe→chữ)   | Nhận dạng giọng nói Cantonese — WER tốt nhất                                                                                                | `Conformer-Yue` (130M), `SenseVoice-Yue` (234M, nhẹ), `Whisper-medium-Yue` (769M) |
| **TTS** (chữ→giọng)  | Đọc Cantonese tự nhiên, zero-shot                                                                                                           | `CosyVoice2-Yue`, `Llasa-1B-Yue` (`ASLP-lab/WSYue-TTS`)                           |
| **Eval**             | Benchmark ASR/TTS                                                                                                                           | `WSYue-ASR-eval`, `WSYue-TTS-eval`                                                |
| **WenetSpeech-Pipe** | Pipeline thu âm → VAD → ASR đa hệ thống → voting → chuẩn hoá                                                                                | trong repo                                                                        |

## 2. 3 hướng áp dụng cho app (theo giá trị/effort)

### 2.1 ⭐ TTS `CosyVoice2-Yue` — sinh audio ví dụ thiếu (ưu tiên LÀM TRƯỚC)

- **Vấn đề hiện tại:** luồng audio `lib/speech.js` = `local MP3 → CDN → TTS fallback` (Web Speech API). Ví dụ mới (backfill `yue` 08-22) có đủ `yue + jyutping` nhưng **thiếu audio** (`hanzi_audio`/`english_audio` trống).
- **Giải pháp:** chạy `CosyVoice2-Yue` như 1 service (GPU), nhận text → trả MP3 → lưu R2 (bucket `cantonese-audio`, public base `https://pub-e701295c4ef64b57a419ea9484e26311.r2.dev`, key = `<id>.mp3`, creds `backend/.env.r2`).
- **Cách triển khai:**
    1. Script batch đọc các ví dụ thiếu audio (`cantonese_vocabulary_examples` + `cantonese_vocabularies`) → gọi TTS → upload R2 → ghi `hanzi_audio`/`english_audio`.
    2. Hoặc thêm endpoint `/api/tts` → frontend fallback trước khi dùng Web Speech API.
- **⚠️ Yêu cầu:** GPU cho inference nhanh. Nếu không có GPU → chạy batch offline tạo clip rồi lưu R2 (không realtime).

### 2.2 🎤 ASR `SenseVoice-Yue` — tính năng "Luyện phát âm" (sau)

- Model 234M, nhẹ, chạy realtime trên GPU tầm trung.
- User đọc câu tiếng Quảng → app nhận dạng → **so sánh với jyutping đúng** → chấm điểm từng chữ.
- Tận dụng cột `jyutping` đã chuẩn hoá (lowercase, bỏ space).
- Khác biệt so với hiện tại (chỉ nghe thụ động) → thêm phần **nói chủ động**.

### 2.3 📚 Khai thác corpus — làm giàu ví dụ (dài hạn)

- 21.800h transcript + timestamp = nguồn **câu ví dụ thực tế**.
- Trích câu chứa từ vựng trong bank → thêm ví dụ "câu thật đời sống" + audio khớp câu.
- Timestamp ký tự → tính năng **karaoke highlight** hán tự trong flashcard.
- ⚠️ Dataset quá lớn → phải **sample subset** theo từ vựng/HSK, KHÔNG tải hết 21.800h.

## 3. Lưu ý kỹ thuật

- **License:** Apache-2.0 — dùng thoải mái, kể cả thương mại.
- **Cài đặt TTS (từ README):**
    ```bash
    git clone https://github.com/ASLP-lab/WenetSpeech-Yue.git && cd CosyVoice2-Yue
    conda create -n cosyvoice python=3.10 && conda activate cosyvoice
    conda install -y -c conda-forge pynini==2.1.5
    pip install -r requirements.txt
    snapshot_download('ASLP-lab/WSYue-TTS', local_dir='pretrained_models')
    ```
- **Inference TTS (từ README):** dùng `CosyVoice2` với opencc s2t, `inference_instruct2(text, '用粤语说这句话', prompt_speech_16k)`.
- **Inference ASR:**
    - Conformer: `python wenet/bin/recognize.py --config train.yaml --checkpoint u2pp_conformer_yue.pt ...`
    - SenseVoice: `from funasr import AutoModel; model.generate(wav_path, language="yue", use_itn=True)`
- **App hiện tại:** backend Fastify (port 3001), Prisma 7.8.0, PostgreSQL (Docker). Restart backend = logout mọi user → đăng nhập lại `admin/admin`. DB chỉ làm việc local (AGENTS.md §1.1 — mọi ghi DB phải hỏi user).

## 4. Việc cần làm khi bắt đầu

- [ ] Xác nhận máy có GPU / dùng batch offline
- [ ] Triển khai TTS service (CosyVoice2-Yue) + script batch sinh audio → R2
- [ ] (Sau) ASR SenseVoice-Yue cho luyện nói
- [ ] (Dài hạn) sample corpus → thêm ví dụ thực tế + karaoke
