I asked 2 competing LLMs to do the exact same thing and they came up with pretty different plans which you can read below. I want you to REALLY carefully analyze their plans with an open mind and be intellectually honest about what they did that's better than your plan. Then I want you to come up with the best possible revisions to your plan (you should simply update your existing document for your original plan with the revisions) that artfully and skillfully blends the "best of all worlds" to create a true, ultimate, superior hybrid version of the plan that best achieves our stated goals and will work the best in real-world practice to solve the problems we are facing and our overarching goals while ensuring the extreme success of the enterprise as best as possible; you should provide me with a complete series of git-diff style changes to your original plan to turn it into the new, enhanced, much longer and detailed plan that integrates the best of all the plans with every good idea included (you don't need to mention which ideas came from which models in the final revised enhanced plan), I use monorepo not k8s:
CLAUDE AI:
# Kiến trúc Backend — Hệ thống Web Học tập Vật lý

## 1. Tổng quan kiến trúc

```
┌─────────────────────────────────────────────────────────────────────┐
│                        API Gateway (Nginx)                         │
└──────────┬──────────────────────────────────────┬───────────────────┘
           │                                      │
    ┌──────▼──────┐                        ┌──────▼──────┐
    │  Auth Service│                        │  Upload API │
    │  (JWT/OAuth) │                        │  (Multer)   │
    └─────────────┘                        └──────┬──────┘
                                                  │
                    ┌─────────────────────────────┤
                    │                             │
             ┌──────▼──────┐              ┌───────▼───────┐
             │ File Storage │              │  Task Queue   │
             │ (S3/R2)     │              │  (BullMQ +    │
             └─────────────┘              │   Redis)      │
                                          └───────┬───────┘
                                                  │
                         ┌────────────────────────┼────────────────────┐
                         │                        │                    │
                  ┌──────▼──────┐         ┌───────▼──────┐    ┌───────▼───────┐
                  │  Extraction │         │  Question    │    │  AI Labeling  │
                  │  Worker     │         │  Parser      │    │  Service      │
                  │             │         │  Worker      │    │               │
                  └──────┬──────┘         └───────┬──────┘    └───────┬───────┘
                         │                        │                    │
                         └────────────────────────┼────────────────────┘
                                                  │
                                          ┌───────▼───────┐
                                          │  PostgreSQL   │
                                          │  (Main DB)    │
                                          └───────────────┘
```

### Tech Stack

| Layer | Công nghệ | Lý do chọn |
|-------|-----------|------------|
| Runtime | Node.js (NestJS) hoặc Go | NestJS: hệ sinh thái npm phong phú, TypeScript, DI pattern rõ ràng. Go: hiệu năng xử lý file tốt hơn |
| Task Queue | BullMQ + Redis | Job scheduling, retry, concurrency control, priority queue |
| Database | PostgreSQL + pgvector | JSONB cho metadata linh hoạt, pgvector cho semantic search |
| Object Storage | Cloudflare R2 / AWS S3 | Lưu file gốc, chi phí thấp, CDN tích hợp |
| Cache | Redis | Cache kết quả AI, session, rate limiting |
| AI/LLM | Claude API (Sonnet) + local embedding | Phân loại câu hỏi, gán nhãn chủ đề |
| OCR | Mathpix API / Google Document AI | Nhận diện công thức toán-lý chính xác |
| Search | PostgreSQL FTS + pgvector | Full-text search + semantic similarity |

---

## 2. Pipeline xử lý file — Chi tiết từng bước

### 2.1. Upload & Validation

```
Teacher uploads file
       │
       ▼
┌──────────────┐     ┌───────────────────────────────┐
│  Validate    │────▶│ Checks:                       │
│  Middleware  │     │  • MIME type (pdf/docx only)   │
│              │     │  • File size ≤ 50MB            │
│              │     │  • Virus scan (ClamAV)         │
│              │     │  • Rate limit (10 files/hour)  │
└──────┬───────┘     └───────────────────────────────┘
       │
       ▼
┌──────────────┐
│ Upload to R2 │──▶ Lưu file gốc với key:
│              │    uploads/{teacher_id}/{exam_id}/{filename}
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Create DB    │──▶ Tạo record trong bảng `exams`
│ Record       │    status = 'uploaded'
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Enqueue Job  │──▶ BullMQ: queue = 'extraction'
│              │    payload = { examId, fileUrl, fileType }
└──────────────┘
```

**Code mẫu — Upload endpoint:**

```typescript
// src/modules/upload/upload.controller.ts
@Post('exams/upload')
@UseGuards(AuthGuard, RolesGuard('teacher'))
@UseInterceptors(FileInterceptor('file', {
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    cb(null, allowed.includes(file.mimetype));
  }
}))
async uploadExam(
  @UploadedFile() file: Express.Multer.File,
  @Body() dto: CreateExamDto,
  @CurrentUser() teacher: User
) {
  // 1. Upload to R2
  const fileKey = `uploads/${teacher.id}/${ulid()}/${file.originalname}`;
  await this.storageService.upload(fileKey, file.buffer, file.mimetype);

  // 2. Create exam record
  const exam = await this.examService.create({
    teacherId: teacher.id,
    title: dto.title,
    subjectId: dto.subjectId,
    chapterId: dto.chapterId,
    gradeLevel: dto.gradeLevel,
    examType: dto.examType, // 'practice' | 'midterm' | 'final'
    fileKey,
    fileType: file.mimetype === 'application/pdf' ? 'pdf' : 'docx',
    status: 'uploaded',
  });

  // 3. Enqueue extraction job
  await this.extractionQueue.add('extract', {
    examId: exam.id,
    fileKey,
    fileType: exam.fileType,
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    priority: dto.priority ?? 5,
  });

  return { examId: exam.id, status: 'processing' };
}
```

---

### 2.2. Extraction Worker — Trích xuất nội dung

Đây là bước phức tạp nhất vì đề Vật lý chứa **công thức toán học** (phân số, tích phân, ký hiệu Hy Lạp, đơn vị...).

#### Chiến lược trích xuất theo loại file:

```
File đầu vào
     │
     ├── DOCX ──▶ mammoth.js (HTML) ──▶ Parse HTML
     │                │
     │                ├── Text nodes ──▶ plain text
     │                ├── OMML/MathML ──▶ chuyển sang LaTeX
     │                └── Embedded images ──▶ OCR (Mathpix)
     │
     └── PDF ───▶ Phân loại PDF
                    │
                    ├── Text-based PDF ──▶ pdf-parse + regex công thức
                    │                         │
                    │                         └── Nếu có công thức dạng
                    │                             image ──▶ Mathpix OCR
                    │
                    └── Scanned PDF ──▶ Full OCR (Mathpix / 
                                        Google Document AI)
```

**Code mẫu — Extraction Worker:**

```typescript
// src/workers/extraction.worker.ts
@Processor('extraction')
export class ExtractionWorker {

  @Process('extract')
  async handleExtraction(job: Job<ExtractionPayload>) {
    const { examId, fileKey, fileType } = job.data;

    // 1. Download file từ R2
    const fileBuffer = await this.storage.download(fileKey);

    // 2. Trích xuất theo loại file
    let extractionResult: ExtractionResult;

    if (fileType === 'docx') {
      extractionResult = await this.extractFromDocx(fileBuffer);
    } else {
      extractionResult = await this.extractFromPdf(fileBuffer);
    }

    // 3. Lưu raw extraction
    await this.examService.updateExtraction(examId, {
      rawText: extractionResult.text,
      rawLatex: extractionResult.latex,
      images: extractionResult.images, // extracted image refs
      status: 'extracted',
    });

    // 4. Enqueue parsing job
    await this.parserQueue.add('parse', {
      examId,
      extractedContent: extractionResult,
    });
  }

  private async extractFromDocx(buffer: Buffer): Promise<ExtractionResult> {
    // Bước 1: mammoth chuyển sang HTML
    const { value: html } = await mammoth.convertToHtml(
      { buffer },
      {
        convertImage: mammoth.images.inline(async (image) => {
          // Nếu image là công thức (WMF/EMF) → gửi OCR
          const imgBuffer = await image.read();
          const latex = await this.mathpixOcr(imgBuffer);
          return { src: `data:text/latex,${encodeURIComponent(latex)}` };
        })
      }
    );

    // Bước 2: Parse HTML, tách text và công thức
    return this.parseHtmlWithFormulas(html);
  }

  private async extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
    // Bước 1: Thử text extraction trước
    const pdfData = await pdfParse(buffer);
    const textDensity = pdfData.text.trim().length / pdfData.numpages;

    if (textDensity < 100) {
      // PDF scan → full OCR
      return this.fullOcrExtraction(buffer);
    }

    // Bước 2: Text-based PDF — trích xuất text
    // Nhưng công thức thường bị mất → cần OCR bổ sung
    const pages = await this.renderPdfPages(buffer); // pdf.js render
    const formulaRegions = this.detectFormulaRegions(pdfData.text);

    // OCR chỉ những vùng có công thức
    const formulas = await Promise.all(
      formulaRegions.map(region =>
        this.mathpixOcr(pages[region.page], region.bbox)
      )
    );

    return this.mergeTextAndFormulas(pdfData.text, formulas);
  }

  private async mathpixOcr(
    imageBuffer: Buffer,
    bbox?: BoundingBox
  ): Promise<string> {
    // Gọi Mathpix API — trả về LaTeX
    const response = await fetch('https://api.mathpix.com/v3/text', {
      method: 'POST',
      headers: {
        'app_id': process.env.MATHPIX_APP_ID,
        'app_key': process.env.MATHPIX_APP_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        src: `data:image/png;base64,${imageBuffer.toString('base64')}`,
        formats: ['latex_styled'],
        math_inline_delimiters: ['$', '$'],
        math_display_delimiters: ['$$', '$$'],
        ...(bbox && { region: bbox }),
      }),
    });

    const data = await response.json();
    return data.latex_styled;
  }
}
```

#### Xử lý công thức — Chi tiết kỹ thuật

Vấn đề lớn nhất: công thức Vật lý bị **hỏng** khi extract. Ví dụ:

| Đầu vào (đề gốc) | Extract thô (sai) | Sau xử lý (đúng) |
|---|---|---|
| $F = k\frac{q_1 q_2}{r^2}$ | F = kq1q2/r2 | `$F = k\\frac{q_1 q_2}{r^2}$` |
| $R_{tđ} = R_1 + R_2$ | Rtđ = R1 + R2 | `$R_{tđ} = R_1 + R_2$` |
| $U = I \cdot R$ | U = I.R | `$U = I \\cdot R$` |

**Giải pháp 3 tầng:**

```
Tầng 1: OCR chuyên biệt (Mathpix)
  → Nhận diện trực tiếp công thức → LaTeX
  → Độ chính xác ~95% cho công thức Vật lý

Tầng 2: Rule-based post-processing
  → Regex sửa các lỗi phổ biến:
    • "R1" → "R_1"
    • "m/s2" → "m/s^2"
    • "10^-6" → "10^{-6}"
    • "Ω" → "\\Omega"

Tầng 3: LLM verification (chỉ khi cần)
  → Gửi câu hỏi có công thức nghi ngờ sai cho Claude
  → Prompt: "Sửa lỗi LaTeX trong câu hỏi Vật lý sau..."
  → Áp dụng cho ~5% câu hỏi khó
```

**Code mẫu — Formula Post-processor:**

```typescript
// src/services/formula-postprocessor.ts
export class FormulaPostProcessor {
  
  private rules: Array<{ pattern: RegExp; replacement: string }> = [
    // Subscript: R1 → R_1, U12 → U_{12}
    { pattern: /([A-Z])(\d{1,2})(?![_^{])/g, replacement: '$1_{$2}' },
    
    // Đơn vị SI
    { pattern: /m\/s2/g, replacement: 'm/s^2' },
    { pattern: /kg\.m\/s/g, replacement: 'kg \\cdot m/s' },
    { pattern: /N\/m2/g, replacement: 'N/m^2' },
    { pattern: /C\/m2/g, replacement: 'C/m^2' },
    
    // Ký hiệu Hy Lạp
    { pattern: /\bmu\b/g, replacement: '\\mu' },
    { pattern: /\bOmega\b/g, replacement: '\\Omega' },
    { pattern: /\bomega\b/g, replacement: '\\omega' },
    { pattern: /\blambda\b/g, replacement: '\\lambda' },
    { pattern: /\bepsilon\b/g, replacement: '\\varepsilon' },
    
    // Hằng số Vật lý
    { pattern: /(\d+)\s*\.\s*10\^?\s*[-–]?\s*(\d+)/g, 
      replacement: '$1 \\times 10^{-$2}' },
    
    // Phân số đơn giản
    { pattern: /(\w+)\/(\w+)/g, replacement: '\\frac{$1}{$2}' },
  ];

  process(text: string): string {
    let result = text;
    for (const rule of this.rules) {
      result = result.replace(rule.pattern, rule.replacement);
    }
    return result;
  }

  // Wrap text có công thức bằng LaTeX delimiters
  wrapFormulas(text: string): string {
    // Detect công thức chưa được wrap
    const formulaPatterns = [
      /(?<!\$)([A-Z]_\{?\d+\}?\s*[=+\-]\s*[\d.]+)/g,  // R_1 = 10
      /(?<!\$)(\\frac\{[^}]+\}\{[^}]+\})/g,              // \frac{...}{...}
      /(?<!\$)(\d+\s*\\times\s*10\^\{[^}]+\})/g,         // 3 \times 10^{-6}
    ];
    
    let result = text;
    for (const pattern of formulaPatterns) {
      result = result.replace(pattern, ' $$$1$$ ');
    }
    return result;
  }
}
```

---

### 2.3. Question Parser — Tách & phân loại câu hỏi

```
Extracted Content
       │
       ▼
┌────────────────┐
│ Structure      │──▶ Nhận diện cấu trúc đề:
│ Detector       │    • Header/phần (Phần I, II, III...)
│                │    • Đánh số câu (Câu 1, Câu 2...)
│                │    • Loại câu (MCQ, T/F, short, essay)
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ Question       │──▶ Tách từng câu hỏi riêng biệt
│ Splitter       │    Giữ nguyên context (đề chung,
│                │    hình vẽ, dữ kiện cho nhóm câu)
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ Type           │──▶ Phân loại 4 dạng:
│ Classifier     │    1. multiple_choice (A, B, C, D)
│ (Rule-based)   │    2. true_false (Đ/S cho mệnh đề)
│                │    3. short_answer (điền số/đáp án)
│                │    4. essay (tự luận, giải chi tiết)
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ Answer Key     │──▶ Trích xuất đáp án (nếu có):
│ Extractor      │    • MCQ: A/B/C/D
│                │    • T/F: Đ/S cho từng mệnh đề
│                │    • Short: giá trị số + đơn vị
│                │    • Essay: lời giải mẫu
└────────────────┘
```

**Code mẫu — Question Parser:**

```typescript
// src/services/question-parser.ts
export class QuestionParser {
  
  // Regex patterns cho đề Vật lý Việt Nam
  private patterns = {
    // "Câu 1:", "Câu 1.", "Câu 1 (1 điểm):", "1.", "1)"
    questionStart: /(?:^|\n)\s*(?:Câu|Question|Bài)\s*(\d+)\s*[.:)\]]?\s*(?:\([\d.,]+\s*điểm\))?\s*[.:]?\s*/gi,
    
    // Phát hiện MCQ: có A. B. C. D.
    mcqOptions: /\n\s*([A-D])\s*[.)]\s*(.+?)(?=\n\s*[A-D]\s*[.)]|\n\s*(?:Câu|$))/gs,
    
    // Phát hiện True/False: "mệnh đề", "đúng hay sai", a) b) c) d)
    trueFalseMarker: /(?:đúng\s*(?:hay|hoặc)\s*sai|mệnh đề.*đúng|TRUE\s*(?:or|\/)\s*FALSE)/i,
    trueFalseItems: /\n\s*([a-d])\s*[.)]\s*(.+?)(?=\n\s*[a-d]\s*[.)]|\n\s*(?:Câu|$))/gs,
    
    // Phát hiện section headers
    sectionHeader: /(?:^|\n)\s*(?:PHẦN|Phần|PART)\s+([IVX\d]+)\s*[.:]?\s*(.+?)(?:\n|$)/gi,
    
    // Shared context (đề chung cho nhóm câu)
    sharedContext: /(?:Dùng|Sử dụng|Cho|Đọc).*?(?:sau đây|bên dưới|sau|để).*?(?:trả lời|làm).*?(?:câu|bài)\s*(\d+)\s*(?:đến|→|–|-)\s*(\d+)/i,
  };

  async parseExam(content: ExtractionResult): Promise<ParsedExam> {
    const text = content.text;
    
    // 1. Phát hiện sections
    const sections = this.detectSections(text);
    
    // 2. Tách từng câu hỏi
    const rawQuestions = this.splitQuestions(text);
    
    // 3. Phân loại và cấu trúc hóa
    const questions: ParsedQuestion[] = [];
    
    for (const raw of rawQuestions) {
      const type = this.classifyQuestion(raw);
      const parsed = this.structureQuestion(raw, type);
      
      // Gắn shared context nếu có
      const sharedCtx = this.findSharedContext(raw.number, sections);
      if (sharedCtx) {
        parsed.sharedContext = sharedCtx;
      }
      
      questions.push(parsed);
    }
    
    return { sections, questions };
  }

  private classifyQuestion(raw: RawQuestion): QuestionType {
    const text = raw.text;
    
    // Kiểm tra MCQ: có ít nhất 3 options A/B/C/D
    const mcqMatches = [...text.matchAll(this.patterns.mcqOptions)];
    if (mcqMatches.length >= 3) {
      return 'multiple_choice';
    }
    
    // Kiểm tra True/False
    if (this.patterns.trueFalseMarker.test(text)) {
      const tfItems = [...text.matchAll(this.patterns.trueFalseItems)];
      if (tfItems.length >= 2) {
        return 'true_false';
      }
    }
    
    // Kiểm tra Short Answer: câu hỏi ngắn, yêu cầu tính giá trị
    const shortAnswerIndicators = [
      /tính\s+(?:giá trị|kết quả|độ lớn)/i,
      /(?:bằng|là)\s*\?/,
      /điền\s+(?:số|đáp án|kết quả)/i,
      /kết quả.*(?:=|bằng)/i,
    ];
    
    const isShort = shortAnswerIndicators.some(p => p.test(text));
    const wordCount = text.split(/\s+/).length;
    
    if (isShort && wordCount < 100 && mcqMatches.length === 0) {
      return 'short_answer';
    }
    
    // Mặc định: essay (tự luận)
    // Thường có: "giải thích", "chứng minh", "tính và trình bày"
    return 'essay';
  }

  private structureQuestion(
    raw: RawQuestion,
    type: QuestionType
  ): ParsedQuestion {
    
    const base: ParsedQuestion = {
      number: raw.number,
      type,
      stem: '', // phần thân câu hỏi
      options: [],
      answer: null,
      rawText: raw.text,
      formulas: this.extractFormulas(raw.text),
    };

    switch (type) {
      case 'multiple_choice': {
        const parts = this.splitMcqParts(raw.text);
        base.stem = parts.stem;
        base.options = parts.options.map(o => ({
          label: o.label,    // 'A', 'B', 'C', 'D'
          content: o.text,
        }));
        break;
      }
      case 'true_false': {
        const parts = this.splitTrueFalseParts(raw.text);
        base.stem = parts.stem;
        base.options = parts.statements.map(s => ({
          label: s.label,     // 'a', 'b', 'c', 'd'
          content: s.text,
          correctAnswer: null, // sẽ fill từ answer key
        }));
        break;
      }
      case 'short_answer': {
        base.stem = raw.text.trim();
        break;
      }
      case 'essay': {
        // Tách yêu cầu con nếu có (a, b, c...)
        const subparts = this.splitSubparts(raw.text);
        base.stem = subparts.main;
        base.subQuestions = subparts.subs;
        break;
      }
    }
    
    return base;
  }

  private extractFormulas(text: string): FormulaReference[] {
    const formulas: FormulaReference[] = [];
    
    // Tìm inline math: $...$
    const inlineRegex = /\$([^$]+)\$/g;
    let match;
    while ((match = inlineRegex.exec(text)) !== null) {
      formulas.push({
        latex: match[1],
        position: match.index,
        display: 'inline',
      });
    }
    
    // Tìm display math: $$...$$
    const displayRegex = /\$\$([^$]+)\$\$/g;
    while ((match = displayRegex.exec(text)) !== null) {
      formulas.push({
        latex: match[1],
        position: match.index,
        display: 'block',
      });
    }
    
    return formulas;
  }
}
```

---

### 2.4. AI Labeling Service — Gán nhãn tự động

#### Kiến trúc hybrid: Rule-based + LLM

```
Parsed Question
       │
       ▼
┌────────────────────┐
│  Rule-based Layer  │──▶ Gán nhãn nhanh bằng keyword matching
│  (chạy trước)      │    Ví dụ: "điện trở" → topic: "dien_tro"
│                    │           "F = ma"  → topic: "dinh_luat_newton"
│                    │    Confidence: low/medium/high
└───────┬────────────┘
        │
        ├── confidence ≥ 0.85 ──▶ Chấp nhận, KHÔNG gọi LLM
        │                         (tiết kiệm ~70% chi phí)
        │
        └── confidence < 0.85 ──▶ Gọi LLM
                                      │
                                      ▼
                              ┌───────────────┐
                              │  LLM Service  │
                              │  (Claude API) │
                              └───────┬───────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │  Merge &      │
                              │  Validate     │──▶ Kết quả cuối cùng
                              └───────────────┘
```

**Code mẫu — AI Labeling:**

```typescript
// src/services/ai-labeling.service.ts
export class AILabelingService {

  // ========== TẦNG 1: RULE-BASED ==========
  
  private topicKeywords: Map<string, string[]> = new Map([
    ['dien_truong', [
      'điện trường', 'cường độ điện trường', 'đường sức',
      'E =', 'lực Coulomb', 'điện tích điểm',
    ]],
    ['dien_tro', [
      'điện trở', 'nối tiếp', 'song song', 'Rtđ', 'R_{tđ}',
      'mắc nối tiếp', 'mắc song song', 'điện trở tương đương',
    ]],
    ['dong_dien', [
      'cường độ dòng điện', 'ampe', 'I =', 'electron',
      'dòng điện', 'mạch điện', 'suất điện động',
    ]],
    ['quang_hoc', [
      'thấu kính', 'gương', 'khúc xạ', 'phản xạ',
      'tiêu cự', 'ảnh thật', 'ảnh ảo', 'lăng kính',
    ]],
    ['co_hoc', [
      'lực', 'gia tốc', 'vận tốc', 'chuyển động',
      'Newton', 'ma sát', 'trọng lực', 'quán tính',
    ]],
    ['song_co', [
      'sóng cơ', 'bước sóng', 'tần số', 'biên độ',
      'giao thoa', 'sóng dừng', 'sóng âm',
    ]],
    ['dao_dong', [
      'dao động', 'con lắc', 'lò xo', 'chu kỳ',
      'tần số góc', 'biên độ', 'dao động điều hòa',
    ]],
    ['dien_tu', [
      'từ trường', 'cảm ứng từ', 'lực Lorentz',
      'từ thông', 'cảm ứng điện từ', 'Faraday',
    ]],
    // ... thêm các chủ đề khác
  ]);

  private difficultyIndicators = {
    easy: {
      keywords: ['tính', 'cho biết', 'xác định', 'là bao nhiêu'],
      formulaCount: { max: 1 },
      stepEstimate: { max: 2 },
    },
    medium: {
      keywords: ['tìm', 'so sánh', 'giải thích', 'áp dụng'],
      formulaCount: { min: 1, max: 3 },
      stepEstimate: { min: 2, max: 4 },
    },
    hard: {
      keywords: ['chứng minh', 'phân tích', 'tổng hợp', 'suy luận'],
      formulaCount: { min: 2 },
      stepEstimate: { min: 4 },
    },
  };

  ruleBasedLabel(question: ParsedQuestion): RuleBasedResult {
    const text = (question.stem + ' ' + 
      question.options?.map(o => o.content).join(' ')).toLowerCase();
    
    // Topic detection
    const topicScores: Array<{ topic: string; score: number }> = [];
    for (const [topic, keywords] of this.topicKeywords) {
      const matchCount = keywords.filter(kw => text.includes(kw.toLowerCase())).length;
      if (matchCount > 0) {
        topicScores.push({
          topic,
          score: matchCount / keywords.length,
        });
      }
    }
    topicScores.sort((a, b) => b.score - a.score);

    // Difficulty estimation
    const formulaCount = question.formulas?.length ?? 0;
    const wordCount = text.split(/\s+/).length;
    let difficulty: 'easy' | 'medium' | 'hard' = 'medium';
    
    if (formulaCount <= 1 && wordCount < 50) difficulty = 'easy';
    if (formulaCount >= 3 || wordCount > 150) difficulty = 'hard';

    const confidence = topicScores[0]?.score ?? 0;

    return {
      topics: topicScores.slice(0, 3).map(t => t.topic),
      difficulty,
      confidence,
      needsLLM: confidence < 0.85,
    };
  }

  // ========== TẦNG 2: LLM LABELING ==========
  
  async llmLabel(
    questions: ParsedQuestion[],    // batch xử lý
    ruleResults: RuleBasedResult[]
  ): Promise<LLMLabel[]> {
    
    // Batch chỉ những câu cần LLM
    const needsLLM = questions.filter((_, i) => ruleResults[i].needsLLM);
    
    if (needsLLM.length === 0) return [];

    // Batch tối đa 10 câu/request để tiết kiệm chi phí
    const batches = this.chunk(needsLLM, 10);
    const results: LLMLabel[] = [];

    for (const batch of batches) {
      const prompt = this.buildLabelingPrompt(batch);
      
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });

      const parsed = this.parseLLMResponse(response.content[0].text);
      results.push(...parsed);
    }

    return results;
  }

  private buildLabelingPrompt(questions: ParsedQuestion[]): string {
    const topicList = Array.from(this.topicKeywords.keys()).join(', ');
    
    return `Bạn là chuyên gia Vật lý THPT. Phân tích các câu hỏi sau và trả về JSON.

Danh sách chủ đề hợp lệ: ${topicList}

Mức độ khó:
- easy: tính toán đơn giản, áp dụng 1 công thức
- medium: kết hợp 2-3 kiến thức, suy luận vừa phải
- hard: bài toán tổng hợp, cần suy luận nhiều bước

Câu hỏi:
${questions.map((q, i) => `
--- Câu ${i + 1} ---
Loại: ${q.type}
Nội dung: ${q.stem}
${q.options?.length ? 'Đáp án:\n' + q.options.map(o => 
  `${o.label}. ${o.content}`).join('\n') : ''}
`).join('\n')}

Trả về CHÍNH XÁC JSON (không có markdown):
[
  {
    "index": 0,
    "topics": ["topic_chính", "topic_phụ"],
    "subtopic": "chi tiết hơn, vd: dien_tro_noi_tiep",
    "difficulty": "easy|medium|hard",
    "skills": ["tính_toán", "suy_luận", "đọc_hiểu_đồ_thị"],
    "bloom_level": "remember|understand|apply|analyze|evaluate|create"
  }
]`;
  }

  // ========== MERGE KẾT QUẢ ==========
  
  mergeLabels(
    ruleResult: RuleBasedResult,
    llmResult?: LLMLabel
  ): FinalLabel {
    if (!llmResult) {
      // Rule-based đủ tốt
      return {
        topics: ruleResult.topics,
        difficulty: ruleResult.difficulty,
        confidence: ruleResult.confidence,
        source: 'rule',
      };
    }

    // LLM kết quả — merge với rule-based
    return {
      topics: llmResult.topics,
      subtopic: llmResult.subtopic,
      difficulty: llmResult.difficulty,
      skills: llmResult.skills,
      bloomLevel: llmResult.bloom_level,
      confidence: 0.95,
      source: 'hybrid',
    };
  }
}
```

---

## 3. Database Schema — Mô hình phân cấp

```
grade_levels (lớp 10, 11, 12)
  └── subjects (Vật lý)
        └── chapters (Chương: Điện tích, Dòng điện...)
              └── topics (Chủ đề: Định luật Coulomb, Mạch điện...)
                    └── questions (Câu hỏi cụ thể)
                          └── question_labels (nhãn AI)
                          └── question_in_exams (thuộc đề thi nào)
```

**Schema PostgreSQL:**

```sql
-- ==========================================
-- CẤU TRÚC PHÂN CẤP
-- ==========================================

CREATE TABLE grade_levels (
  id          SMALLINT PRIMARY KEY,  -- 10, 11, 12
  name        TEXT NOT NULL           -- 'Lớp 10', 'Lớp 11', 'Lớp 12'
);

CREATE TABLE subjects (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,          -- 'Vật lý'
  slug        TEXT UNIQUE NOT NULL    -- 'vat-ly'
);

CREATE TABLE chapters (
  id          SERIAL PRIMARY KEY,
  subject_id  INT REFERENCES subjects(id),
  grade_id    SMALLINT REFERENCES grade_levels(id),
  name        TEXT NOT NULL,          -- 'Điện tích – Điện trường'
  slug        TEXT NOT NULL,
  order_index SMALLINT NOT NULL,      -- thứ tự trong SGK
  UNIQUE(subject_id, grade_id, slug)
);

CREATE TABLE topics (
  id          SERIAL PRIMARY KEY,
  chapter_id  INT REFERENCES chapters(id),
  name        TEXT NOT NULL,          -- 'Định luật Coulomb'
  slug        TEXT NOT NULL,
  UNIQUE(chapter_id, slug)
);

-- ==========================================
-- ĐỀ THI
-- ==========================================

CREATE TYPE exam_type AS ENUM (
  'practice',     -- bài tập luyện
  'quiz',         -- kiểm tra 15 phút
  'midterm',      -- giữa kỳ
  'final',        -- cuối kỳ
  'mock',         -- thi thử
  'national'      -- đề thi THPT QG
);

CREATE TYPE processing_status AS ENUM (
  'uploaded',
  'extracting',
  'extracted',
  'parsing',
  'parsed',
  'labeling',
  'completed',
  'failed'
);

CREATE TABLE exams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id      UUID NOT NULL REFERENCES users(id),
  title           TEXT NOT NULL,
  subject_id      INT REFERENCES subjects(id),
  grade_id        SMALLINT REFERENCES grade_levels(id),
  chapter_ids     INT[],                    -- có thể liên quan nhiều chương
  exam_type       exam_type NOT NULL,
  year            SMALLINT,                 -- năm thi
  
  -- File info
  file_key        TEXT NOT NULL,             -- R2 object key
  file_type       TEXT NOT NULL,             -- 'pdf' | 'docx'
  file_size       INT NOT NULL,
  
  -- Processing
  status          processing_status DEFAULT 'uploaded',
  raw_text        TEXT,                      -- text trích xuất thô
  error_message   TEXT,
  processing_log  JSONB DEFAULT '[]',
  
  -- Metadata
  total_questions INT,
  total_points    DECIMAL(5,2),
  duration_minutes INT,                      -- thời gian làm bài
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_exams_teacher ON exams(teacher_id);
CREATE INDEX idx_exams_status ON exams(status);
CREATE INDEX idx_exams_subject_grade ON exams(subject_id, grade_id);

-- ==========================================
-- CÂU HỎI
-- ==========================================

CREATE TYPE question_type AS ENUM (
  'multiple_choice',   -- trắc nghiệm ABCD
  'true_false',        -- đúng/sai
  'short_answer',      -- trả lời ngắn
  'essay'              -- tự luận
);

CREATE TYPE difficulty_level AS ENUM (
  'easy', 'medium', 'hard'
);

CREATE TABLE questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Nội dung
  type            question_type NOT NULL,
  stem            TEXT NOT NULL,            -- phần thân câu hỏi
  stem_latex      TEXT,                     -- stem với LaTeX formulas
  options         JSONB,                    -- MCQ/TF options
  -- Ví dụ MCQ:
  -- [
  --   {"label": "A", "content": "$R = 10\\Omega$", "is_correct": true},
  --   {"label": "B", "content": "$R = 20\\Omega$", "is_correct": false},
  --   ...
  -- ]
  
  correct_answer  JSONB,                   -- đáp án đúng
  -- MCQ: {"label": "A"}
  -- TF:  {"a": true, "b": false, "c": true, "d": false}
  -- Short: {"value": "10", "unit": "Ω"}
  -- Essay: {"solution": "Lời giải..."}
  
  explanation     TEXT,                     -- giải thích đáp án
  shared_context  TEXT,                     -- đề chung cho nhóm câu
  points          DECIMAL(4,2),             -- điểm
  
  -- Hình ảnh/media
  images          JSONB DEFAULT '[]',       -- [{key: "img/...", caption: "Hình 1"}]
  
  -- Phân cấp
  subject_id      INT REFERENCES subjects(id),
  grade_id        SMALLINT REFERENCES grade_levels(id),
  
  -- AI Labels (denormalized cho query nhanh)
  topic_ids       INT[],                    -- FK to topics
  difficulty      difficulty_level,
  skills          TEXT[],                   -- ['tinh_toan', 'suy_luan']
  bloom_level     TEXT,
  
  -- Embedding cho semantic search
  embedding       vector(1536),             -- pgvector
  
  -- Deduplication
  content_hash    TEXT,                     -- SHA256 of normalized content
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_questions_type ON questions(type);
CREATE INDEX idx_questions_difficulty ON questions(difficulty);
CREATE INDEX idx_questions_topics ON questions USING GIN(topic_ids);
CREATE INDEX idx_questions_skills ON questions USING GIN(skills);
CREATE INDEX idx_questions_subject_grade ON questions(subject_id, grade_id);
CREATE INDEX idx_questions_hash ON questions(content_hash);
CREATE INDEX idx_questions_embedding ON questions 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ==========================================
-- LIÊN KẾT CÂU HỎI - ĐỀ THI
-- ==========================================

CREATE TABLE question_in_exams (
  question_id     UUID REFERENCES questions(id),
  exam_id         UUID REFERENCES exams(id),
  question_number SMALLINT NOT NULL,        -- số thứ tự trong đề
  section         TEXT,                     -- "Phần I", "Phần II"
  PRIMARY KEY (question_id, exam_id)
);

-- ==========================================
-- AI LABELING LOG (audit trail)
-- ==========================================

CREATE TABLE ai_labeling_logs (
  id              SERIAL PRIMARY KEY,
  question_id     UUID REFERENCES questions(id),
  label_source    TEXT NOT NULL,           -- 'rule' | 'llm' | 'hybrid' | 'manual'
  model_version   TEXT,                    -- 'claude-sonnet-4-20250514'
  input_tokens    INT,
  output_tokens   INT,
  cost_usd        DECIMAL(8,6),
  raw_response    JSONB,
  confidence      DECIMAL(3,2),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- USERS & PERMISSIONS
-- ==========================================

CREATE TYPE user_role AS ENUM ('student', 'teacher', 'admin');

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  role            user_role NOT NULL,
  school          TEXT,
  grade_id        SMALLINT REFERENCES grade_levels(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Tối ưu chi phí AI

### 4.1. Chiến lược tổng thể

```
                    Câu hỏi mới
                         │
                         ▼
                  ┌──────────────┐
            ┌─────│  Cache Check │─────┐
            │     └──────────────┘     │
            │                          │
         HIT ▼                         ▼ MISS
   ┌──────────────┐             ┌──────────────┐
   │ Return cached│             │ Content Hash │
   │ label        │             │ Check (dedup)│
   └──────────────┘             └──────┬───────┘
                                       │
                                ┌──────┴───────┐
                           FOUND▼              ▼NOT FOUND
                    ┌──────────────┐    ┌──────────────┐
                    │Copy existing │    │ Rule-based   │
                    │labels        │    │ Layer        │
                    └──────────────┘    └──────┬───────┘
                                              │
                                    ┌─────────┴─────────┐
                              HIGH  ▼                   ▼ LOW
                           confidence              confidence
                        ┌──────────────┐       ┌──────────────┐
                        │ Accept rules │       │ Batch for    │
                        │ (no LLM)     │       │ LLM call     │
                        └──────────────┘       └──────┬───────┘
                                                      │
                                                      ▼
                                               ┌──────────────┐
                                               │ Batch LLM    │
                                               │ (10 câu/req) │
                                               └──────────────┘
```

### 4.2. Chi phí ước tính

| Phương pháp | Chi phí / 1000 câu | Ghi chú |
|------------|-------------------|---------|
| 100% LLM (không tối ưu) | ~$2.50 | Mỗi câu 1 request |
| Batch LLM (10 câu/req) | ~$0.80 | Giảm overhead |
| Hybrid (rule 70% + LLM 30%) | ~$0.25 | Chỉ LLM câu khó |
| + Dedup cache | ~$0.15 | Câu trùng dùng cache |
| + Embedding cache | ~$0.12 | Câu tương tự dùng label cũ |

### 4.3. Implementation chi tiết

```typescript
// src/services/cost-optimizer.ts
export class CostOptimizer {
  
  // Cache bằng Redis với TTL
  private cachePrefix = 'label:';
  
  async getOrLabel(question: ParsedQuestion): Promise<FinalLabel> {
    // 1. Check content hash cache
    const hash = this.hashContent(question);
    const cached = await this.redis.get(`${this.cachePrefix}${hash}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // 2. Check DB dedup — cùng nội dung đã có?
    const existing = await this.questionRepo.findByHash(hash);
    if (existing?.topic_ids?.length) {
      const label = this.buildLabelFromExisting(existing);
      await this.cacheLabel(hash, label);
      return label;
    }

    // 3. Semantic similarity — câu tương tự đã gán nhãn?
    if (question.embedding) {
      const similar = await this.questionRepo.findSimilar(
        question.embedding,
        0.92 // cosine similarity threshold
      );
      if (similar) {
        const label = this.buildLabelFromExisting(similar);
        label.confidence *= 0.9; // giảm confidence vì là suy luận
        return label;
      }
    }

    // 4. Rule-based
    const ruleResult = this.labelingService.ruleBasedLabel(question);
    if (ruleResult.confidence >= 0.85) {
      const label = this.labelingService.mergeLabels(ruleResult);
      await this.cacheLabel(hash, label);
      return label;
    }

    // 5. Cần LLM — thêm vào batch
    return this.addToBatch(question, ruleResult);
  }

  // Batch processor — gom câu hỏi, gọi LLM 1 lần
  private batchQueue: Array<{
    question: ParsedQuestion;
    ruleResult: RuleBasedResult;
    resolve: (label: FinalLabel) => void;
  }> = [];

  private batchTimer: NodeJS.Timeout | null = null;

  private addToBatch(
    question: ParsedQuestion,
    ruleResult: RuleBasedResult
  ): Promise<FinalLabel> {
    return new Promise((resolve) => {
      this.batchQueue.push({ question, ruleResult, resolve });
      
      // Flush khi đủ 10 câu hoặc sau 5 giây
      if (this.batchQueue.length >= 10) {
        this.flushBatch();
      } else if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => this.flushBatch(), 5000);
      }
    });
  }

  private async flushBatch() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    const batch = this.batchQueue.splice(0, 10);
    if (batch.length === 0) return;

    const llmResults = await this.labelingService.llmLabel(
      batch.map(b => b.question),
      batch.map(b => b.ruleResult)
    );

    for (let i = 0; i < batch.length; i++) {
      const label = this.labelingService.mergeLabels(
        batch[i].ruleResult,
        llmResults[i]
      );
      const hash = this.hashContent(batch[i].question);
      await this.cacheLabel(hash, label);
      batch[i].resolve(label);
    }
  }

  private hashContent(q: ParsedQuestion): string {
    const normalized = (q.stem + JSON.stringify(q.options ?? ''))
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    return createHash('sha256').update(normalized).digest('hex');
  }

  private async cacheLabel(hash: string, label: FinalLabel) {
    await this.redis.setex(
      `${this.cachePrefix}${hash}`,
      86400 * 30, // 30 ngày
      JSON.stringify(label)
    );
  }
}
```

### 4.4. Embedding Service

```typescript
// src/services/embedding.service.ts
export class EmbeddingService {
  
  // Dùng local model để tránh chi phí API
  // Recommendation: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
  // Hỗ trợ tiếng Việt, nhẹ (~120MB), chạy được trên CPU
  
  private model: any; // ONNX runtime hoặc gọi Python subprocess
  
  async embed(text: string): Promise<number[]> {
    // Option 1: Local ONNX model (khuyến nghị)
    const embedding = await this.model.encode(text);
    return Array.from(embedding);
    
    // Option 2: Nếu cần chất lượng cao hơn
    // Dùng Anthropic/OpenAI embedding API
    // Chi phí: ~$0.0001 / câu hỏi
  }

  async batchEmbed(texts: string[]): Promise<number[][]> {
    // Batch encode cho hiệu quả
    return Promise.all(texts.map(t => this.embed(t)));
  }
}
```

---

## 5. API Design

### 5.1. RESTful Endpoints

```yaml
# ==========================================
# EXAM MANAGEMENT
# ==========================================

POST   /api/v1/exams/upload
  # Upload đề thi
  # Body: multipart/form-data
  # Fields: file, title, subjectId, gradeId, chapterIds[], examType
  # Response: { examId, status: 'processing' }

GET    /api/v1/exams/:id
  # Chi tiết đề thi + trạng thái xử lý
  # Response: { exam, processingProgress, questions[] }

GET    /api/v1/exams/:id/status
  # Polling trạng thái xử lý (hoặc dùng WebSocket)
  # Response: { status, progress: 0.75, currentStep: 'labeling' }

GET    /api/v1/exams
  # List đề thi với filters
  # Query: ?gradeId=11&subjectId=1&examType=midterm&page=1&limit=20

DELETE /api/v1/exams/:id
  # Xóa đề thi (soft delete)

# ==========================================
# QUESTIONS
# ==========================================

GET    /api/v1/questions
  # Tìm câu hỏi với bộ lọc mạnh
  # Query params:
  #   gradeId=11
  #   subjectId=1
  #   chapterId=3
  #   topicIds[]=5&topicIds[]=6
  #   type=multiple_choice
  #   difficulty=medium
  #   skills[]=tinh_toan
  #   search=điện trở               (full-text search)
  #   similar=<questionId>           (semantic similarity)
  #   page=1&limit=20
  #   sort=difficulty:asc

GET    /api/v1/questions/:id
  # Chi tiết 1 câu hỏi

PATCH  /api/v1/questions/:id/labels
  # Giáo viên chỉnh sửa labels (override AI)
  # Body: { topicIds, difficulty, skills }

# ==========================================
# TAXONOMY
# ==========================================

GET    /api/v1/grades
GET    /api/v1/grades/:id/chapters
GET    /api/v1/chapters/:id/topics
GET    /api/v1/topics
  # Query: ?search=điện&gradeId=11

# ==========================================
# PRACTICE / QUIZ GENERATION
# ==========================================

POST   /api/v1/practice/generate
  # Tạo bài tập tự động
  # Body: {
  #   gradeId: 11,
  #   chapterIds: [3, 4],
  #   difficulty: { easy: 5, medium: 3, hard: 2 },
  #   types: { multiple_choice: 6, true_false: 2, essay: 2 },
  #   excludeQuestionIds: [...]
  # }
  # Response: { practiceId, questions[] }
```

### 5.2. Response Format — Xử lý công thức cho frontend

Vấn đề: công thức LaTeX phải đến frontend **nguyên vẹn**, không bị escape hay encode sai.

```typescript
// src/interceptors/formula-response.interceptor.ts

// Response format cho câu hỏi
interface QuestionResponse {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer' | 'essay';
  
  // Nội dung với 2 format song song
  stem: {
    // Plain text (cho search, screen reader)
    text: string;
    // HTML với LaTeX markers (cho render)
    // Dùng KaTeX delimiters: \( inline \) và \[ block \]
    html: string;
  };
  
  options?: Array<{
    label: string;
    content: {
      text: string;
      html: string;
    };
    // is_correct chỉ trả về cho teacher
  }>;
  
  // Metadata
  difficulty: string;
  topics: Array<{ id: number; name: string }>;
  chapter: { id: number; name: string };
}

// Ví dụ response thực tế:
const exampleResponse = {
  id: "q_01HZ...",
  type: "multiple_choice",
  stem: {
    text: "Cho mạch điện gồm R1 = 10Ω mắc nối tiếp với R2 = 20Ω. "
        + "Hiệu điện thế hai đầu mạch U = 30V. "
        + "Cường độ dòng điện trong mạch là:",
    html: "Cho mạch điện gồm \\(R_1 = 10\\Omega\\) mắc nối tiếp với "
        + "\\(R_2 = 20\\Omega\\). Hiệu điện thế hai đầu mạch "
        + "\\(U = 30V\\). Cường độ dòng điện trong mạch là:",
  },
  options: [
    {
      label: "A",
      content: {
        text: "I = 1A",
        html: "\\(I = 1A\\)",
      }
    },
    {
      label: "B", 
      content: {
        text: "I = 1.5A",
        html: "\\(I = 1{,}5A\\)",
      }
    },
    // ...
  ],
  difficulty: "easy",
  topics: [
    { id: 5, name: "Điện trở nối tiếp" },
    { id: 3, name: "Định luật Ohm" },
  ],
  chapter: { id: 3, name: "Dòng điện trong kim loại" },
};
```

**API Convention cho formulas:**

```typescript
// Quy ước: 
// - Text: pure plaintext, KHÔNG có LaTeX markers
// - HTML: dùng KaTeX delimiters
//   + Inline: \( ... \)
//   + Block:  \[ ... \]
// 
// Frontend chỉ cần gọi:
//   renderMathInElement(container, {
//     delimiters: [
//       { left: "\\(", right: "\\)", display: false },
//       { left: "\\[", right: "\\]", display: true },
//     ]
//   });
//
// KHÔNG dùng $...$ vì dễ xung đột với text thường
// (ví dụ: "giá $100" sẽ bị render sai)
```

---

## 6. Luồng xử lý dữ liệu tổng thể

```
┌─────────┐   POST /upload   ┌──────────┐   BullMQ    ┌──────────────┐
│ Teacher  │────────────────▶│  API     │───────────▶│  Extraction  │
│ (client) │                  │  Server  │             │  Worker      │
└─────────┘                  └──────────┘             └──────┬───────┘
     │                            │                          │
     │  GET /exams/:id/status     │                          │
     │◀──── WebSocket / SSE ──────│                          │
     │  { progress: 0.3 }        │                          ▼
     │                            │                   ┌──────────────┐
     │                            │                   │  Question    │
     │                            │                   │  Parser      │
     │                            │                   └──────┬───────┘
     │                            │                          │
     │                            │                          ▼
     │                            │                   ┌──────────────┐
     │                            │                   │  AI Labeling │
     │                            │                   │  Service     │
     │                            │                   └──────┬───────┘
     │                            │                          │
     │  { status: 'completed' }   │                          │
     │◀──── WebSocket / SSE ──────│◀─────────────────────────┘
     │                            │     Update DB + notify
     │                            │
     │  GET /questions?...        │
     │───────────────────────────▶│     Query DB
     │◀──── JSON response ────────│
     │  (với LaTeX formulas)      │
     │                            │
```

**Thời gian xử lý ước tính:**

| Bước | Thời gian | Ghi chú |
|------|----------|---------|
| Upload + validate | < 2s | Sync |
| Extraction (DOCX) | 5-15s | Tùy file size |
| Extraction (PDF + OCR) | 15-60s | Tùy số trang, công thức |
| Question parsing | 2-5s | CPU-bound |
| AI labeling (rule) | < 1s | In-memory |
| AI labeling (LLM batch) | 3-8s | API call |
| Embedding generation | 2-5s | Local model |
| **Tổng** | **30s - 90s** | |

---

## 7. Infrastructure & Deployment

### 7.1. Docker Compose (Development)

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build: .
    ports: ['3000:3000']
    environment:
      DATABASE_URL: postgres://app:secret@postgres:5432/physics_learn
      REDIS_URL: redis://redis:6379
      R2_ENDPOINT: ${R2_ENDPOINT}
      R2_ACCESS_KEY: ${R2_ACCESS_KEY}
      R2_SECRET_KEY: ${R2_SECRET_KEY}
      MATHPIX_APP_ID: ${MATHPIX_APP_ID}
      MATHPIX_APP_KEY: ${MATHPIX_APP_KEY}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    depends_on: [postgres, redis]
    volumes:
      - ./src:/app/src

  worker:
    build: .
    command: node dist/workers/main.js
    environment: *api-env  # same env as api
    depends_on: [postgres, redis]

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: physics_learn
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
    ports: ['5432:5432']
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']

volumes:
  pgdata:
```

### 7.2. Production (VPS — Hetzner/DigitalOcean)

```
Specs khuyến nghị cho giai đoạn đầu:
─────────────────────────────────────
• VPS: Hetzner CX31 (4 vCPU, 8GB RAM) — ~€8.5/tháng
• hoặc DigitalOcean Droplet (4GB RAM) — ~$24/tháng
• Database: PostgreSQL trên cùng VPS (giai đoạn đầu)
• Object Storage: Cloudflare R2 (10GB free tier)
• Redis: trên cùng VPS

Khi scale (>1000 users):
────────────────────────
• Tách DB ra managed service (Supabase / Neon)
• Worker chạy trên VPS riêng
• Load balancer (Cloudflare Tunnel)
```

---

## 8. Kế hoạch triển khai thực tế

### Phase 1: MVP (4-6 tuần)

```
Tuần 1-2: Foundation
├── Setup project (NestJS + TypeScript)
├── Database schema + migrations
├── Auth module (JWT)
├── File upload endpoint + R2 integration
└── Basic DOCX extraction (mammoth.js)

Tuần 3-4: Core Pipeline
├── PDF extraction (pdf-parse)
├── Mathpix OCR integration
├── Question parser (rule-based)
├── BullMQ job queue setup
└── Processing status API (polling)

Tuần 5-6: AI + API
├── Rule-based labeling
├── Claude API integration (batch)
├── Question query API (filters)
├── Formula format standardization
└── Basic testing + deploy
```

### Phase 2: Enhancement (4 tuần)

```
├── Embedding service (local model)
├── Semantic search (pgvector)
├── Cost optimization (cache, dedup)
├── Practice/quiz generation API
├── WebSocket real-time status
├── Teacher dashboard: review & override labels
└── Performance testing + optimization
```

### Phase 3: Scale (ongoing)

```
├── Support thêm môn (Toán, Hóa)
├── Multi-tenant (nhiều trường)
├── Analytics (thống kê câu hỏi, độ khó)
├── Spaced repetition algorithm
├── Export đề thi (PDF generation)
└── Mobile API optimization
```

---

## 9. Quan trọng — Những điểm cần lưu ý

### 9.1. Xử lý công thức là thách thức lớn nhất

Đề Vật lý Việt Nam thường soạn bằng Word với **Equation Editor** hoặc **MathType**. Khi extract:
- OMML (Office Math) → cần chuyển sang LaTeX
- MathType objects → embedded OLE → cần OCR
- Công thức dạng text thuần (R1, m/s2) → cần regex fix

**Khuyến nghị:** Đầu tư thời gian vào module formula extraction. Đây là nơi quyết định chất lượng toàn hệ thống.

### 9.2. Mathpix pricing

- Free tier: 100 requests/tháng
- Edu plan: $9.99/tháng cho 5000 requests
- Mỗi trang PDF = 1 request
- Cần budget ~$10-30/tháng tùy lượng đề upload

### 9.3. Claude API cost management

- Sonnet: ~$3/1M input tokens, ~$15/1M output tokens
- Mỗi batch 10 câu ≈ 2000 input + 500 output tokens
- Với hybrid approach: ~$5-15/tháng cho 1000 câu hỏi mới
- **Luôn set `max_tokens` hợp lý** để tránh output dài

### 9.4. Security checklist

```
□ File upload: validate MIME, size limit, virus scan
□ Rate limiting: per-user, per-endpoint
□ SQL injection: dùng parameterized queries (TypeORM/Prisma)
□ Auth: JWT with refresh tokens, role-based access
□ R2: signed URLs cho file access, không public
□ API keys: env vars, không commit vào git
□ CORS: whitelist frontend domains only
```


GEMINI AI:
Kiến trúc Tổng thể và Thiết kế Backend cho Hệ thống Quản lý và Phân tích Dữ liệu Học tập môn Vật lý Tích hợp Trí tuệ Nhân tạoKiến trúc Hệ thống Tổng thể và Định hướng Giao tiếp Dữ liệuViệc xây dựng một nền tảng học tập trực tuyến đặc thù cho môn Vật lý, với yêu cầu tự động hóa hoàn toàn luồng công việc từ lúc giáo viên tải lên một tệp tài liệu phi cấu trúc (PDF, Word) cho đến khi dữ liệu được bóc tách, chuẩn hóa và lưu trữ, đòi hỏi một thiết kế kiến trúc phần mềm có độ tinh vi cao. Khác với các tài liệu văn bản thông thường, tài liệu giáo dục môn Vật lý là một thực thể đa phương thức (multimodal entity) phức tạp, bao gồm văn bản mật độ cao, công thức toán học nội tuyến, các khối phương trình độc lập, sơ đồ mạch điện, đồ thị động học và các bảng biểu số liệu. Sự phức tạp này loại trừ khả năng sử dụng các hệ thống nguyên khối (monolithic architecture) và các công cụ nhận dạng ký tự quang học (OCR) truyền thống. Thay vào đó, kiến trúc backend phải được cấu trúc dựa trên mô hình dịch vụ vi mô (Microservices) kết hợp chặt chẽ với kiến trúc hướng sự kiện (Event-Driven Architecture) để đảm bảo khả năng mở rộng độc lập, đặc biệt đối với các module Trí tuệ Nhân tạo (AI) vốn đòi hỏi tài nguyên tính toán và bộ nhớ khổng lồ.Hệ thống được thiết kế bao gồm một tập hợp các lớp chức năng tách biệt, giao tiếp với nhau thông qua các giao thức mạng nội bộ và hàng đợi thông điệp. Lớp đầu tiên là Control Plane (Mặt phẳng Điều khiển), bao gồm API Gateway và logic ứng dụng cốt lõi, thường được phát triển bằng các framework hiệu năng cao như FastAPI hoặc Django. Lớp này chịu trách nhiệm tiếp nhận yêu cầu từ frontend, quản lý xác thực người dùng, thiết lập các phiên làm việc và điều phối luồng dữ liệu mà không trực tiếp tham gia vào các quá trình tính toán nặng nề. Nhiệm vụ của Control Plane là cung cấp các endpoint RESTful (hoặc GraphQL) đạt chuẩn, tiếp nhận tài liệu gốc và định tuyến chúng vào các khu vực lưu trữ an toàn.Lớp thứ hai là Storage Layer (Lớp Lưu trữ), được chia thành nhiều phân hệ chuyên biệt. Tệp PDF hoặc Word gốc sẽ được đẩy vào Object Storage (chẳng hạn như Amazon S3 hoặc MinIO) để lưu trữ nhị phân lâu dài, đảm bảo tài liệu gốc luôn có thể được truy xuất lại. Dữ liệu siêu dữ liệu (metadata) của tệp và thông tin trạng thái tải lên được ghi nhận tức thời vào cơ sở dữ liệu quan hệ PostgreSQL. Các cấu trúc dữ liệu tạm thời, trạng thái hàng đợi và bộ nhớ đệm phục vụ cho hệ thống AI được quản lý bởi Redis hoặc Amazon MemoryDB.Lớp thứ ba, đóng vai trò trái tim luân chuyển của hệ thống, là Message Broker và Task Queue. Do các tác vụ như phân tích tài liệu bằng mô hình thị giác máy tính và truy vấn các Mô hình Ngôn ngữ Lớn (LLM) có thể mất từ vài chục giây đến vài phút, hệ thống sử dụng RabbitMQ hoặc Redis kết hợp với Celery để quản lý hàng đợi tác vụ bất đồng bộ. Việc bóc tách quá trình xử lý tài liệu nặng nề khỏi luồng phản hồi HTTP đồng bộ là nguyên tắc bắt buộc để tránh tình trạng tràn thời gian chờ (timeout) tại các bộ định tuyến (router) của hệ thống máy chủ.Lớp cuối cùng là Data Plane (Mặt phẳng Dữ liệu), bao gồm các Document Processing Workers và AI Service Nodes. Các node này hoạt động độc lập, liên tục lắng nghe các sự kiện từ Message Broker. Khi một tệp tài liệu mới được tải lên và lưu trữ thành công, một sự kiện sẽ kích hoạt Celery Worker. Worker tiến hành tải tệp về không gian làm việc cục bộ, khởi chạy pipeline OCR đa phương thức để trích xuất nội dung và công thức. Tiếp theo, nội dung thô được phân mảnh để tách từng câu hỏi, kết hợp giữa biểu thức chính quy (Regex) và LLM để xác định ranh giới và phân loại dạng câu hỏi. Dữ liệu sau đó tiếp tục đi qua module AI chuyên sâu để gán nhãn tri thức Vật lý (chủ đề, mức độ khó, phân loại nhận thức). Cuối cùng, kết quả cấu trúc hóa được lưu ngược trở lại PostgreSQL và một tín hiệu hoàn thành được phát ra, thông báo cho Control Plane rằng dữ liệu đã sẵn sàng để phục vụ frontend. Sự tách biệt hoàn toàn giữa Control Plane và Data Plane tạo ra một hệ thống có độ đàn hồi cực cao, cho phép hệ thống mở rộng hàng nghìn node xử lý AI trong thời gian cao điểm mà không làm suy giảm tốc độ phản hồi API của người dùng web.Xử lý Đa phương thức và Trích xuất Công thức Toán - Vật lýThách thức kỹ thuật khốc liệt nhất trong việc số hóa ngân hàng câu hỏi Vật lý là việc trích xuất chính xác văn bản và công thức từ tài liệu đầu vào mà không làm sai lệch ý nghĩa toán học. Các công cụ nhận dạng chữ viết thông thường thường sinh ra nhiễu định dạng (Formatting Noise), phá vỡ cấu trúc phương trình, hoặc tạo ra hiện tượng "ảo giác" (hallucination) khi cố gắng phiên dịch các ma trận ký tự dày đặc thành văn bản thuần. Đối với bộ môn Vật lý, việc sai lệch một chỉ số dưới (subscript) hoặc một dấu tích phân có thể làm thay đổi hoàn toàn bản chất của bài toán. Do đó, hệ thống tích hợp một pipeline định tuyến thông minh (Smart Routing Pipeline) để lựa chọn phương thức trích xuất tối ưu dựa trên định dạng tệp đầu vào.Công nghệ Trích xuấtĐặc điểm Kiến trúcPhân tích Ưu điểm và Hạn chế trong Môi trường Giáo dụcMathpix OCRDịch vụ API đám mây thương mại chuyên biệt cho Toán học và Khoa học.Tiêu chuẩn vàng về độ chính xác chuyển đổi PDF/Hình ảnh sang LaTeX, MathML. Tuy nhiên, chi phí API trả phí cho hàng triệu trang tài liệu tạo ra gánh nặng tài chính khổng lồ, khiến nó không phù hợp để làm giải pháp duy nhất cho một hệ thống mở rộng.NougatMô hình OCR học sâu được tối ưu hóa cho các bài báo khoa học.Có khả năng nhận diện công thức trong tài liệu học thuật rất tốt. Tuy nhiên, tốc độ suy luận rất chậm (đạt từ 90 đến 700 giây cho mỗi trang PDF) và gặp khó khăn trong việc khái quát hóa các bố cục tài liệu có định dạng phá cách hoặc phi tiêu chuẩn thường thấy trong các đề thi tự biên soạn.Marker OCR kết hợp LLMGiải pháp mã nguồn mở kết hợp mô hình học máy và Mô hình Ngôn ngữ Lớn.Tốc độ vượt trội, có thể xử lý 25 trang/giây trên phần cứng cấp doanh nghiệp (H100) ở chế độ xử lý hàng loạt. Khi kích hoạt cờ --use_llm kết hợp với các mô hình như Gemini 2.0 Flash, hệ thống có thể kết nối bảng biểu, giải quyết các công thức nội tuyến tinh vi và loại bỏ phần đầu/chân trang dư thừa hiệu quả.DoclingHệ thống phân tích cú pháp tài liệu dựa trên mô hình Heron Layout.Phân tích trực tiếp các định dạng có cấu trúc mã nguồn (như.tex,.docx,.html) mà không cần qua bước kết xuất đồ họa (rasterization). Hỗ trợ xuất dữ liệu nguyên vẹn dưới chuẩn JSON (DoclingDocument), xuất sắc trong việc giữ gìn cây cấu trúc tài liệu.Dựa trên bảng đánh giá năng lực công nghệ, pipeline trích xuất được thiết kế thành hai luồng xử lý riêng biệt. Nếu giáo viên tải lên tài liệu mã nguồn (ví dụ: file LaTeX .tex) hoặc tài liệu có cấu trúc thẻ nội tại (như Microsoft Word .docx), hệ thống sẽ bỏ qua toàn bộ quá trình OCR. Thay vào đó, tệp sẽ được định tuyến đến luồng xử lý của Docling. Docling sử dụng các thuật toán phân tích cú pháp tĩnh để trích xuất trực tiếp mã LaTeX hoặc MathML ẩn bên trong các đối tượng OLE của Word, xuất kết quả ra cấu trúc dữ liệu DoclingDocument bảo toàn 100% độ chính xác. Quá trình này tiêu tốn rất ít tài nguyên điện toán và diễn ra gần như ngay lập tức.Trong trường hợp đầu vào là tệp PDF (đặc biệt là PDF quét từ ảnh hoặc không có lớp văn bản), tài liệu sẽ được định tuyến đến Marker OCR. Marker sẽ chia nhỏ tệp PDF thành các trang độc lập và sử dụng mô hình nhận diện cấu trúc để khoanh vùng (bounding box) các đoạn văn bản, hình ảnh và công thức. Để đạt được chất lượng tiệm cận Mathpix mà không phụ thuộc vào nền tảng đóng, hệ thống khởi chạy chế độ lai (Hybrid Mode) của Marker, chuyển tiếp các khối hình ảnh chứa công thức toán học và sơ đồ vật lý phức tạp sang một mô hình ngôn ngữ thị giác (Vision-Language Model - VLM) như InternVL2 hoặc Qwen2-VL được triển khai cục bộ, hoặc Gemini Flash qua API. Mô hình VLM này được huấn luyện đặc biệt để trả về mã LaTeX tương ứng với hình ảnh. Toàn bộ chuỗi văn bản và mã LaTeX thu được sau đó trải qua một lớp hậu xử lý (post-processing). Tại đây, mọi công thức được chuẩn hóa nghiêm ngặt: công thức nội tuyến (inline math) được bọc bởi cặp ký tự $ đơn, và công thức dạng khối (display math) được bọc bởi cặp $$ kép. Việc chuẩn hóa từ sớm trong luồng dữ liệu đảm bảo tính đồng nhất tuyệt đối cho các giai đoạn xử lý ngữ nghĩa phía sau.Phân tích Cấu trúc Ngữ cảnh và Phân mảnh Câu hỏi Tự độngSau khi tệp tài liệu được chuyển đổi thành công thành một chuỗi văn bản Markdown xen kẽ mã LaTeX, hệ thống phải đối mặt với bài toán chia nhỏ khối văn bản khổng lồ này thành các thực thể câu hỏi độc lập (Chunking). Ngôn ngữ tiếng Việt đặt ra những thách thức sâu sắc trong xử lý ngôn ngữ tự nhiên, từ các vấn đề mã hóa ký tự Unicode (ký tự tổ hợp và dựng sẵn) cho đến sự đa dạng trong cách giáo viên định dạng đề thi. Nếu hệ thống chỉ phụ thuộc vào biểu thức chính quy (Regex), tỷ lệ lỗi sẽ tăng cao do các mẫu định dạng không nhất quán (ví dụ: "Câu 1.", "Câu 1:", "Bài 1", hay thậm chí chỉ là "1."). Ngược lại, nếu đưa toàn bộ văn bản cho LLM phân tách, chi phí mã thông báo (token) sẽ bùng nổ, đồng thời tăng rủi ro mô hình tự động thay đổi hoặc "bịa" thêm nội dung.Giải pháp tối ưu là triển khai một mô hình kết hợp (Hybrid Rule-based + LLM Contextual Verification). Quá trình bắt đầu với Giai đoạn Quét tĩnh bằng Regex. Backend sử dụng các động cơ Regex tương thích với UTF-8 (áp dụng modifier u trong PHP hoặc các cờ tương đương trong Python) để quét văn bản. Để xử lý triệt để tiếng Việt, các mẫu Regex không chỉ tìm kiếm các ký tự Latinh cơ bản mà phải bao hàm toàn bộ dải mã Unicode của tiếng Việt có dấu, như \x{00C0}-\x{00FF}\x{1EA0}-\x{1EFF}, nhằm tránh hiện tượng ranh giới từ bị cắt đứt sai lệch do các dấu thanh. Mẫu nhận diện bắt đầu câu hỏi thường được thiết kế tinh vi: /(Câu|Bài|Question)\s*\d+[\.:\)]\s*/ui. Các biểu thức này đóng vai trò như các cảm biến quét qua toàn bộ tài liệu, đánh dấu các điểm ngắt tiềm năng (potential breakpoints).Dạng Câu HỏiDấu hiệu Cấu trúc và Quy tắc Nhận diện (Heuristics)Vai trò của LLM trong quá trình Xác minhTrắc nghiệm (MC)Tìm kiếm cụm từ khóa phương án. Mẫu Regex điển hình: /^[\.\)]\s+/m. Hệ thống đếm số lượng phương án (thường từ 3 đến 5) xuất hiện sau một điểm ngắt câu hỏi.Nếu các phương án được trình bày trên cùng một dòng ngang, Regex có thể bỏ sót. LLM nhỏ (như mBERT tiếng Việt) sẽ đọc ngữ cảnh để tách các phương án lựa chọn ẩn trong câu văn.Đúng/Sai (TF)Tương tự trắc nghiệm nhưng hệ thống phát hiện các ma trận bảng, hoặc các cụm từ đặc trưng ("Đúng hay Sai", "True/False", "Chọn các mệnh đề đúng"). Chỉ chứa 2 giá trị đối lập.LLM đánh giá xem một danh sách các mệnh đề có phải là một bộ câu hỏi Đúng/Sai cấu trúc phức hợp (Cluster TF) hay chỉ là một danh sách liệt kê thông thường trong thân bài.Trả lời ngắn (SA)Không tìm thấy bất kỳ cụm phương án lựa chọn nào. Văn bản chứa khoảng trống định dạng bằng dấu chấm ...... hoặc các yêu cầu cụ thể như "Điền số", "Tính giá trị của".LLM phân tích từ khóa mệnh lệnh (Imperative keywords) như "Xác định", "Điền vào", kết hợp với độ dài câu trả lời dự kiến để quyết định đây là SA chứ không phải Tự luận.Tự luận (Essay)Không có phương án lựa chọn. Đoạn văn bản mô tả bối cảnh vật lý dài. Các động từ nhận thức mức độ cao: "Chứng minh", "Phân tích", "Lập luận", "Thiết kế".LLM xem xét tính toàn vẹn của bài toán (Problem space) và độ phức tạp của phương trình yêu cầu để xác nhận đặc tính Tự luận của thực thể.Sau bước quét tĩnh, Giai đoạn Kiểm chứng Ngữ cảnh bằng LLM được kích hoạt cho các khu vực văn bản mà Regex trả về mức độ tin cậy thấp. Các phân đoạn nghi ngờ được gửi tới một mô hình xử lý ngôn ngữ nhỏ gọn, được tinh chỉnh chuyên biệt cho tác vụ phân đoạn văn bản (Text Segmentation) tiếng Việt. Mô hình này không tạo ra văn bản mới mà chỉ sinh ra cấu trúc dữ liệu JSON định nghĩa lại tọa độ ranh giới chính xác của từng câu hỏi và gán nhãn dạng câu (MC, TF, SA, Essay) dựa trên các định nghĩa phân loại (rubrics) đã được lập trình sẵn. Phương pháp lai này đảm bảo tốc độ xử lý nhanh chóng của hệ thống kỹ thuật truyền thống, đồng thời kế thừa khả năng thấu hiểu ngữ cảnh mềm dẻo của mạng nơ-ron sâu, mang lại độ chính xác tiệm cận tuyệt đối trong việc phân mảnh tài liệu học thuật.Thiết kế Mô hình Dữ liệu Phân cấp Chuyên sâu với PostgreSQLKhối lượng dữ liệu sinh ra từ một ngân hàng câu hỏi Vật lý cấp quốc gia hoặc toàn trường là vô cùng lớn, đồng thời mang tính cấu trúc mạng lưới (network) và phân cấp (hierarchical) chặt chẽ. Hệ thống cần biểu diễn hệ sinh thái tri thức theo một cây phân cấp sâu: Lớp học $\rightarrow$ Môn học $\rightarrow$ Chương $\rightarrow$ Chủ đề $\rightarrow$ Dạng câu hỏi $\rightarrow$ Kỳ thi. Để đảm bảo hiệu suất truy vấn, tính toàn vẹn dữ liệu và khả năng mở rộng không giới hạn, việc thiết kế lược đồ cơ sở dữ liệu (Database Schema) trên PostgreSQL phải vượt xa các mô hình bảng phẳng (flat tables) truyền thống.Một phương pháp lập mô hình dữ liệu phân cấp thường bị lạm dụng là Danh sách Kề (Adjacency List). Trong mô hình này, một bảng taxonomy sẽ chứa một cột parent_id liên kết khóa ngoại với chính cột id của bảng đó. Mặc dù mô hình này trực quan và dễ thực hiện các thao tác ghi (INSERT, UPDATE), nó bộc lộ điểm yếu chí mạng khi đối mặt với các truy vấn đọc (READ). Để liệt kê toàn bộ câu hỏi thuộc nhánh "Lớp 12 $\rightarrow$ Vật lý $\rightarrow$ Điện từ học" (bao gồm tất cả các chủ đề con ẩn sâu bên trong), cơ sở dữ liệu phải thực thi các câu lệnh đệ quy CTE (Recursive Common Table Expressions) tốn kém tài nguyên tính toán nghiêm trọng. Trong một ứng dụng web có lưu lượng truy cập lớn, các truy vấn đệ quy liên tục sẽ nhanh chóng làm cạn kiệt CPU của máy chủ cơ sở dữ liệu.Để giải quyết triệt để nút thắt cổ chai này, kiến trúc hệ thống áp dụng phần mở rộng (extension) ltree của PostgreSQL, đại diện cho phương pháp Materialized Path (Đường dẫn Cụ thể hóa). Kiểu dữ liệu ltree lưu trữ đường dẫn phân cấp đầy đủ của một nút dưới dạng chuỗi văn bản có nhãn, ví dụ: Grade12.Physics.Electromagnetism.Electric_Field. Việc truy xuất toàn bộ dữ liệu thuộc một nhánh trở nên cực kỳ hiệu quả thông qua các toán tử đại số ltree chuyên biệt. Ví dụ, truy vấn SELECT * FROM questions WHERE taxonomy_path <@ 'Grade12.Physics.Electromagnetism' sẽ lập tức trả về tất cả các nút con, cháu thuộc nhánh Điện từ học mà không cần bất kỳ lệnh JOIN phức tạp nào. Quan trọng hơn, ltree hỗ trợ mạnh mẽ các chỉ mục GiST (Generalized Search Tree) và B-Tree, cung cấp tốc độ tra cứu logarit tối ưu, biến các thao tác quét cây phân cấp sâu thành các thao tác truy xuất gần như tức thời.Kiến trúc Lược đồ Cơ sở dữ liệu (Schema Architecture) được tổ chức theo nguyên tắc phân lập dữ liệu nghiêm ngặt. Hệ thống không lưu trữ toàn bộ thực thể vào không gian tên public mặc định. Thay vào đó, dữ liệu được chia nhỏ thành các schema riêng biệt như curriculum_schema (chứa cây danh mục kiến thức chuẩn) và tenant_schema (chứa dữ liệu riêng tư của từng giáo viên/trường học), từ đó hỗ trợ kiến trúc Multi-tenancy an toàn và ngăn chặn rò rỉ dữ liệu.Cấu trúc các bảng cốt lõi (Core Tables) trong không gian lưu trữ bao gồm:Bảng taxonomy_nodes: Quản lý cây phân cấp tri thức.Trường id (UUID, Primary Key).Trường path (Kiểu ltree, đánh chỉ mục GiST).Trường name (Varchar).Trường metadata (JSONB, lưu trữ mục tiêu học tập, chuẩn đầu ra).Bảng questions: Lưu trữ các thực thể câu hỏi độc lập.Trường id (UUID, Primary Key).Trường taxonomy_path (Kiểu ltree, tham chiếu đến node trong cây phân cấp).Trường question_type (Enum: MC, TF, SA, Essay).Trường raw_content (Văn bản thô nguyên bản từ PDF/Word).Trường processed_content (Kiểu JSONB chuẩn hóa, tách biệt văn bản Markdown và công thức LaTeX để frontend dễ dàng parse).Trường ai_metadata (JSONB, lưu trữ nhãn chuyên đề, mức độ khó, độ phân cách do AI đánh giá).Bảng question_options: Quản lý các phương án lựa chọn đối với các câu hỏi trắc nghiệm hoặc đúng/sai.Trường id (UUID).Trường question_id (Khóa ngoại trỏ về questions).Trường content (JSONB, chứa Markdown/LaTeX của phương án).Trường is_correct (Boolean).Để xử lý bài toán cập nhật cấu trúc (ví dụ: bộ giáo dục thay đổi cấu trúc chương trình, di chuyển "Quang học" sang một nhánh khác), hệ thống tích hợp các hàm kích hoạt (Triggers) và thủ tục lưu trữ (Stored Procedures). Khi một nút cha bị di chuyển, thủ tục lưu trữ sẽ chạy ngầm để cập nhật lại chuỗi path của toàn bộ các nút con. Mặc dù quá trình này tiêu tốn chi phí ghi (write cost) cao hơn so với Adjacency List, nhưng với đặc thù của dữ liệu giáo dục (tỷ lệ đọc/ghi là 95/5), sự đánh đổi này mang lại hiệu năng truy xuất vượt bậc cho trải nghiệm duyệt ngân hàng câu hỏi của người dùng.Phân tích Ngữ nghĩa và Gán nhãn Tự động bằng Module Trí tuệ Nhân tạo Đa tầngGiá trị cốt lõi của một hệ thống quản lý học tập thế hệ mới không chỉ nằm ở việc lưu trữ dữ liệu thụ động, mà ở khả năng thiết lập một hệ thống khái niệm (Ontology) tri thức thông minh thông qua khả năng thấu hiểu ngữ nghĩa của máy học. Module AI được thiết kế để đọc hiểu văn bản, nhận diện các định luật và đại lượng Vật lý ẩn trong bài toán, từ đó tự động gán nhãn câu hỏi theo chủ đề (ví dụ: Điện trường, Điện trở nối tiếp/song song, Động học hạt), dạng bài tập cụ thể, mức độ khó và phân loại nhận thức (Bloom's Taxonomy).Việc triển khai AI trong lĩnh vực khoa học chính xác (Hard Sciences) đòi hỏi các kỹ thuật điều phối prompt phức tạp. Các nghiên cứu gần đây về việc sử dụng LLM để chấm điểm và phân loại bài tập Vật lý cho thấy rằng: nếu yêu cầu một mô hình LLM giải quyết toàn bộ các tham số phân loại trong một lượt truy vấn duy nhất (Zero-shot, Multi-category classification), độ chính xác (F1-score) thường cực kỳ thấp. Chẳng hạn, điểm F1 trong việc phân loại mức độ khó của bài tập (exercise-difficulty-level) chỉ đạt khoảng 0.23, và phân loại theo mức độ Bloom cũng chỉ đạt 0.40. Sự kém hiệu quả này bắt nguồn từ việc mô hình bị quá tải ngữ cảnh và thiếu hụt các tiêu chí tham chiếu rõ ràng.Để nâng cao độ chuẩn xác học thuật, module AI được thiết kế theo kiến trúc Chuỗi Tác vụ Vi mô (Chain-of-Tasks) và Định tuyến Động (Dynamic Routing).Quá trình bắt đầu với bước Trích xuất Đặc trưng Trọng tâm (Feature Extraction). Khi một câu hỏi mới được đưa vào, hệ thống thực hiện một truy vấn sơ bộ để yêu cầu mô hình nhận diện các "thực thể Vật lý có tên" (Named Physical Entities) như danh sách biến số, hằng số, đại lượng đo lường và các phương trình toán học ngầm định. Việc này giúp thu hẹp Không gian Bài toán (Problem Space).Sau khi đặc trưng được trích xuất, bộ Định tuyến Tác vụ (Task Router) sẽ phân tích độ phức tạp của khối lượng công việc. Đối với các tác vụ phân loại cơ bản mang tính nhị phân hoặc phân loại danh mục rộng (như xác định bài toán thuộc phân môn "Cơ học" hay "Điện từ học"), hệ thống sẽ điều hướng dữ liệu đến các mô hình kích thước nhỏ (như Llama-3-8B hoặc Mistral 7B được tinh chỉnh nội bộ). Các mô hình này có ưu điểm suy luận cực nhanh và chi phí điện toán gần như bằng không. Tuy nhiên, đối với các phân tích suy luận sâu—như việc phân tích xem để giải bài toán cần kết hợp Định luật bảo toàn động lượng và Định lý động năng, hay chỉ cần một bước thay số đơn giản—dữ liệu sẽ được định tuyến đến các mô hình ngôn ngữ lớn mạnh mẽ nhất (như GPT-4o hoặc Claude 3.5 Sonnet).Để khắc phục điểm yếu trong việc gán nhãn đa chiều, hệ thống áp dụng kỹ thuật Prompt Nhúng Tiêu chí (Few-shot Prompting with Rubrics). Prompt gửi đến LLM không chỉ chứa nội dung câu hỏi, mà còn được bơm sẵn (injected) một hệ thống tiêu chí chấm điểm (rubric) chi tiết và các ví dụ tham chiếu (few-shot examples). Mô hình được yêu cầu lập luận từng bước (Chain-of-Thought) để phân tích câu hỏi theo ba trục tọa độ đánh giá độc lập: (i) Độ phức tạp về số lượng bước giải (Single-step vs. Multi-step), (ii) Độ trừu tượng của khái niệm Vật lý tham chiếu, và (iii) Độ khó của các phép biến đổi đại số / vi tích phân. Sự phân rã logic này giúp điểm số đánh giá mức độ khó từ AI tiệm cận sát sao với nhận định của các chuyên gia sư phạm.Nhằm triệt tiêu tối đa hiện tượng ảo giác (hallucination), hệ thống thiết lập một rào chắn kiểm soát chất lượng (Reliability Guardrails) kết hợp giữa trí tuệ nhân tạo và các Hệ thống Đại số Máy tính (Computer Algebra Systems - CAS) dựa trên bộ quy tắc cứng (Rule-based). Khi LLM trả về các nhãn phân loại, kết quả này được truyền qua một bộ xác thực nội bộ (Validator). Bộ xác thực này sẽ đối chiếu các nhãn với một cơ sở dữ liệu từ điển Vật lý được xây dựng chặt chẽ. Ví dụ, nếu LLM báo cáo rằng một bài toán con lắc đơn thuộc chương "Điện từ trường", bộ Validator sẽ ngay lập tức phát hiện sự bất hợp lý (anomaly), từ chối kết quả của AI, gắn cờ (flag) bản ghi và đẩy nó vào một hàng đợi đặc biệt để quản trị viên hoặc giáo viên kiểm tra thủ công. Cơ chế kiểm soát chéo (cross-validation) này đảm bảo tính đúng đắn khoa học tuyệt đối cho nền tảng giáo dục.Chiến lược Tối ưu Hóa Chi phí và Độ trễ của Trí tuệ Nhân tạoViệc triển khai các mô hình AI tiên tiến ở quy mô công nghiệp luôn đi kèm với thách thức lớn về bài toán kinh tế. Khi hệ thống mở rộng để phục vụ hàng nghìn giáo viên, việc gọi API liên tục cho mọi truy vấn gửi đến các dịch vụ LLM thương mại sẽ tạo ra chi phí vận hành khổng lồ, đồng thời gây ra độ trễ hệ thống (latency) khó chấp nhận. Do đó, kiến trúc backend được tích hợp một chiến lược tối ưu hóa chi phí đa tầng, biến đổi luồng tiêu thụ API theo hướng tinh gọn và thông minh.Chiến lược Tối ưu Hóa (LLM Optimization)Cơ chế Hoạt động Kỹ thuậtHiệu quả Cắt giảm Chi phí và Tốc độExact Match Caching (Bộ nhớ đệm khớp chính xác)Sử dụng thuật toán băm (hashing) như SHA-256 để tạo chữ ký cho nội dung truy vấn. Lưu trữ kết quả AI trả về trong bộ nhớ Redis/Memcached. Nếu chuỗi tải lên sau đó khớp 100%, kết quả được truy xuất từ RAM.Giảm 15% - 25% chi phí trực tiếp. Độ trễ giảm từ hàng giây xuống mức mili-giây. Dễ dàng triển khai nhất.Semantic Caching (Bộ nhớ đệm ngữ nghĩa)Biến đổi câu hỏi thành vector nhúng (embeddings) thông qua các mô hình kích thước nhỏ. Lưu vector vào cơ sở dữ liệu in-memory (như Amazon MemoryDB hoặc Redis LangCache). Sử dụng thuật toán tìm kiếm khoảng cách cosine để tìm các câu hỏi tương tự.Cắt giảm 30% - 40% chi phí (có thể lên tới 90% đối với các yêu cầu lặp lại). Xử lý hoàn hảo các câu hỏi được giáo viên diễn đạt lại (paraphrased) nhưng giữ nguyên bản chất Vật lý.Dynamic Batching (Xử lý lô động)Hàng đợi Celery thu thập nhiều tác vụ (ví dụ 50 câu hỏi từ cùng một đề) thay vì gọi API từng cái một. Gói tất cả vào một ngữ cảnh chung hoặc gọi qua Bulk API.Đổi một phần nhỏ độ trễ (latency trade-off) để lấy lợi ích tài chính khổng lồ, khai thác mức giá chiết khấu API theo lô từ các nhà cung cấp. Giảm overhead mạng.Prompt Compression & Context Caching (Nén lệnh và Lưu đệm ngữ cảnh)Lớp trừu tượng (Abstraction Layer) phân rã prompt thành phần tĩnh (chỉ thị hệ thống, rubric phân loại) và phần động (nội dung câu hỏi). Phần tĩnh được lưu trữ trên máy chủ của nhà cung cấp LLM.Loại bỏ việc phải thanh toán lặp đi lặp lại cho các mã thông báo (tokens) hướng dẫn hệ thống trong mỗi luồng giao tiếp. Giảm thiểu chi phí token đầu vào một cách bền vững.Trong đó, Bộ nhớ đệm Ngữ nghĩa (Semantic Caching) là cơ chế mang tính cách mạng nhất trong hệ thống AI hiện đại. Trong lĩnh vực giáo dục, tính trùng lặp là rất cao. Hàng nghìn giáo viên có thể cùng tải lên các biến thể khác nhau của "Bài toán thang tựa tường" hoặc "Sự rơi tự do". Thay vì kích hoạt LLM cho mỗi lần tải, hệ thống biến đổi câu hỏi thành vector thông qua một mô hình Embedding được tinh chỉnh đặc biệt cho ngôn ngữ Vật lý. Khi một truy vấn mới đi vào không gian vector, nếu độ tương đồng (similarity threshold) với các truy vấn cũ vượt qua mức cho phép, hệ thống sẽ bỏ qua bước gọi LLM tốn kém và tái sử dụng ngay lập tức các nhãn đã được chuyên gia hoặc LLM định danh trước đó. Để tối đa hóa hiệu quả, dữ liệu truy vấn sẽ trải qua bước tiền xử lý nhằm loại bỏ "nhiễu ngữ nghĩa" (semantic noise) như các từ nối dư thừa, và ứng dụng lớp tinh chỉnh kết quả xếp hạng lại (LLM-based reranking layer) để cân bằng tinh tế giữa độ chính xác (Precision) và độ phủ (Recall). Ngoài ra, cơ chế điều tiết băng thông (Throttling) và áp dụng chính sách giới hạn tài nguyên (Rate limits) ở cấp độ người dùng được thiết lập chặt chẽ để chặn đứng tình trạng lạm dụng tài nguyên hoặc các vòng lặp hệ thống ngoài ý muốn, bảo vệ ngân sách hạ tầng một cách tuyệt đối.Thiết kế Tiêu chuẩn API và Quy chuẩn Dữ liệu Hiển thịNăng lực phân tích mạnh mẽ của Backend sẽ trở nên vô nghĩa nếu dữ liệu truyền tới Frontend bị lỗi hiển thị. Một trong những sự cố phổ biến và gây ức chế nhất trên các nền tảng giáo dục khối STEM là lỗi kết xuất (rendering) công thức. Các thư viện hiển thị web phổ biến như MathJax hay KaTeX vô cùng nhạy cảm với các lỗi thụt lề (indentation) hoặc việc lạm dụng ký tự thoát (escaping characters) do LLM sinh ra.Để đảm bảo hệ thống frontend hoạt động trơn tru, mọi giao tiếp dữ liệu được thiết kế tuân thủ nghiêm ngặt đặc tả OpenAPI Specification (OAS) phiên bản 3.1.1. Giao thức này định nghĩa rõ ràng cấu trúc của hợp đồng dữ liệu (Data Contract), hỗ trợ các công cụ sinh mã nguồn tự động, tài liệu hóa API và kiểm thử nội bộ tích hợp. Dữ liệu trả về (JSON payload) từ API luôn phân định rạch ròi giữa văn bản thuần, siêu dữ liệu và cấu trúc toán học.Khắc phục triệt để lỗi định dạng yêu cầu một chuỗi các Chỉ thị Nền (System Instructions) bắt buộc được nhúng vào mọi prompt gửi tới các mô hình LLM, ép buộc mô hình phải tuân thủ các quy chuẩn định dạng gắt gao sau :Chuẩn hóa Dấu Phân cách Toán học: Các mô hình LLM thường có xu hướng sử dụng nhiều biến thể khác nhau để bọc toán học (như \( hoặc `\Quy tắc "Thụt lề Số Không" (Zero Indentation Rule): Khi một phương trình dạng khối $$ được đặt bên trong các cấu trúc danh sách (như đáp án A, B, C, D của câu trắc nghiệm), dòng chứa $$ bắt buộc phải bắt đầu ở đầu dòng tuyệt đối. Nếu LLM thêm bất kỳ khoảng trắng hoặc phím tab nào dẫn trước, bộ phân tích Markdown (Markdown Parser) của frontend sẽ lập tức hiểu nhầm đó là một khối mã thuần (Code Block), dẫn đến hiện tượng màn hình hiển thị mã LaTeX thô ráp thay vì hình ảnh công thức toán học sắc nét.Tách biệt Mã Lập trình và Ký pháp Toán học: Khối lượng mã nguồn của hệ thống cấm mô hình đưa biểu thức toán học hoặc mã LaTeX vào bên trong cặp ba dấu ngoặc ngược (triple backticks - ```). Ký hiệu này được hệ thống bảo lưu hoàn toàn cho mã lập trình thực thi (như Python hoặc C++).Hỗ trợ Khả năng Trợ năng (Accessibility - a11y): Để xây dựng một nền tảng giáo dục bao trùm (Universal Design for Learning - UDL), API phải được thiết kế để hỗ trợ tối đa người khiếm thị. Backend đảm bảo rằng các công thức LaTeX được sinh ra có thể chuyển đổi mượt mà sang ngôn ngữ đánh dấu MathML hoặc được gắn các nhãn văn bản thay thế (Alternative Text) có ý nghĩa ngữ nghĩa cao, giúp các phần mềm đọc màn hình (Screen Readers) như JAWS có thể diễn giải cấu trúc toán học một cách chính xác cho sinh viên.Kế hoạch Triển khai Thực tiễn, Mở rộng Quy mô và Vận hành (Deployment & Scaling Plan)Sự phức tạp của một hệ thống tài liệu kết hợp Trí tuệ Nhân tạo tạo ra một đặc tính tải trọng bất cân xứng cực đoan. Một yêu cầu HTTP gửi từ giao diện web (ví dụ: tạo mới tài khoản) chỉ mất vài mili-giây để hoàn thành. Trong khi đó, luồng tác vụ phân tích tài liệu, nội soi PDF bằng Marker OCR, và suy luận RAG bằng mô hình LLM có thể kéo dài hàng chục phút. Nếu triển khai hệ thống này trên các nền tảng kiến trúc phi trạng thái không máy chủ (Serverless platforms) truyền thống, hệ thống sẽ gặp thất bại thảm hại do các bộ định tuyến (router) áp đặt các giới hạn thời gian chờ (execution timeouts) nghiêm ngặt, dẫn đến việc các luồng công việc AI bị "giết" giữa chừng.Kiến trúc Đám mây "Brain and Brawn" (Não và Cơ bắp)Chiến lược triển khai thực tiễn áp dụng mô hình phân tách tài nguyên có tên gọi "Não và Cơ bắp"."Brain" (Luồng Điều khiển Trung tâm): Logic lõi của ứng dụng (API Gateway), bộ định tuyến và cơ sở dữ liệu PostgreSQL được lưu trữ trên một nền tảng điện toán đám mây quản lý (Managed Cloud Platform) hoặc một cụm Kubernetes có khả năng tự phục hồi. Khối "Não" này đảm bảo độ tin cậy của giao thức HTTP, lưu trữ trạng thái người dùng bền vững và cung cấp độ trễ phản hồi thấp nhất có thể cho frontend."Brawn" (Luồng Xử lý Hạng nặng): Quá trình suy luận dựa trên GPU thô (chạy Marker OCR, giải mã Vision-Language Models) được cách ly và offload hoàn toàn cho các môi trường điện toán chuyên biệt (như AWS EC2 G-series, RunPod) hoặc các thiết bị AI cận biên (Edge AI Nodes) nếu nhà trường mong muốn triển khai hệ thống trên máy chủ vật lý nội bộ (On-premise) nhằm tận dụng bảo mật phần cứng và cắt giảm phí lưu lượng mạng.Quản trị Celery Workers và Mở rộng Theo Chiều Ngang (Horizontal Scaling)Sức mạnh thực sự của hệ thống AI xử lý tài liệu nằm ở khả năng điều phối mạng lưới Worker bất đồng bộ. Hệ thống ứng dụng framework Celery làm hạt nhân của lớp xử lý nền, với các thiết lập cấu hình tinh vi để chống chịu lỗi (Fault Tolerance) và xử lý dữ liệu ở quy mô lớn.Phân vùng Hàng đợi Thông minh (Queue Separation): Nguyên tắc thiết kế đầu tiên là không được phép dồn mọi tác vụ vào một hàng đợi mặc định (default queue). Backend sẽ định tuyến các công việc vào các kênh chuyên biệt: ocr_gpu_queue (dành cho các tác vụ đòi hỏi card đồ họa để xử lý Marker), llm_api_queue (dành cho các tiến trình giao tiếp mạng chờ phản hồi từ LLM thương mại), và db_io_queue (chuyên trách chuẩn hóa JSON và lưu trữ vào PostgreSQL). Việc cách ly này ngăn chặn tình trạng một tệp PDF lỗi khổng lồ làm ách tắc toàn bộ tiến trình gán nhãn câu hỏi của hệ thống.Tối ưu hóa Mức độ Đồng thời (Concurrency Tuning): Số lượng luồng xử lý (concurrency level) của từng Celery Worker được tinh chỉnh tùy theo bản chất của hàng đợi. Đối với các tác vụ phụ thuộc CPU (CPU-bound) như quét Regex, số lượng luồng bằng với số nhân CPU. Tuy nhiên, đối với các tác vụ GPU, concurrency phải bị giới hạn nghiêm ngặt ở mức thấp để ngăn chặn tình trạng cạn kiệt bộ nhớ VRAM đồ họa (Out-of-Memory Errors) làm sập hệ thống máy chủ.Tự động Mở rộng Dự đoán (Autoscaling & Metric Monitoring): Hệ thống tích hợp các tác nhân thu thập số liệu (như Prometheus) để liên tục giám sát chiều dài của các hàng đợi RabbitMQ hoặc Redis. Trong các thời điểm cao điểm học thuật (mùa thi cử), khi lượng tài liệu đẩy lên hệ thống tăng đột biến, logic Tự động Mở rộng (Auto Scaling Group) trên hạ tầng đám mây sẽ tự động khởi tạo (provision) thêm hàng chục Celery Worker mới để tham gia xử lý tải trọng. Khi hàng đợi đã được dọn dẹp trống, hệ thống sẽ từ từ thu hẹp quy mô (scale down) các máy chủ GPU đắt đỏ để tối ưu hóa ngân sách vận hành.Cơ chế Phản hồi Trễ và Bảo toàn Dữ liệu (Ack_Late & Prefetch Limits): Do tính chất không ổn định cố hữu của mạng internet và các kết nối API ngoại vi, hệ thống Celery được thiết lập với chế độ phản hồi trễ (acks_late) kết hợp cùng giới hạn nạp trước cực thấp (prefetch limits). Theo cấu hình này, một tác vụ chỉ được đánh dấu là "đã hoàn thành" và bị xóa khỏi Message Broker sau khi và chỉ khi toàn bộ dữ liệu JSON đã được cam kết ghi thành công vào bảng questions trong PostgreSQL. Nếu một Worker gặp sự cố mất kết nối, hệ điều hành khởi động lại, hoặc API LLM phản hồi lỗi quá tải (HTTP 503), thông điệp xử lý sẽ được từ chối (NACK) và trả ngược lại hàng đợi để một Worker khỏe mạnh khác tiếp quản. Cơ chế này đóng vai trò như một bức tường thành bảo vệ sự toàn vẹn dữ liệu, đảm bảo tỷ lệ hoàn thành tác vụ (Task Completion Rate) luôn đạt 100% trong môi trường sản xuất thực tế.Thông qua việc kết hợp các chuẩn mực kỹ thuật phần mềm đương đại, kiến trúc vi dịch vụ mở rộng linh hoạt, cơ sở dữ liệu xử lý cây phân cấp chuyên sâu, cùng chiến lược tối ưu hóa đa phương thức đối với các mô hình ngôn ngữ lớn, bản thiết kế kiến trúc backend này cung cấp một bộ máy vận hành có sức mạnh vượt trội. Nó không chỉ đáp ứng hoàn hảo sự khắt khe về tính chính xác học thuật của bộ môn Vật lý, mà còn kiến tạo một nền tảng kinh tế bền vững, dễ dàng bảo trì và sẵn sàng triển khai ngay lập tức trong các mô hình công nghệ giáo dục (EdTech) quy mô lớn. Tầm nhìn kiến trúc này loại bỏ sự mong manh của các hệ thống AI thử nghiệm, đưa sức mạnh của trí tuệ nhân tạo vào khuôn khổ của một giải pháp phần mềm doanh nghiệp vững chắc, bảo mật và hiệu năng cao.