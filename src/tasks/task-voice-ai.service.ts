import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import OpenAI, { toFile } from "openai";
import { User, Department } from "../users/user.entity";
import { CreateTaskDto } from "./dto/create-task.dto";
import { VoiceTaskOutputLanguage, VoiceKnownUserDto } from "./dto/voice-task-transcript.dto";
import {
  TaskPriority,
  TaskType,
  TaskWorkflowType,
} from "./entities/task.entity";

const ALLOWED_AUDIO_MIME = new Set([
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/ogg",
  "video/webm",
]);

export interface VoiceTaskExtract {
  title: string | null;
  description: string | null;
  priority: TaskPriority | null;
  due_date: string | null;
  assignee_names: string[];
  assignee_ids: number[];
}

export type VoiceRosterUser = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  department?: string | null;
};

export interface VoiceTaskBuildResult {
  transcript: string;
  draft: {
    title: string;
    description: string;
    priority: TaskPriority;
    due_date: string;
    start_date: string;
    department: Department;
    assignee_labels: string[];
    output_language: VoiceTaskOutputLanguage;
  };
  payload: CreateTaskDto;
  warnings: string[];
}

@Injectable()
export class TaskVoiceAiService {
  private readonly logger = new Logger(TaskVoiceAiService.name);
  private client: OpenAI | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  private getClient(): OpenAI {
    if (this.client) return this.client;

    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey?.trim()) {
      throw new HttpException(
        "OpenAI is not configured. Set OPENAI_API_KEY in environment.",
        500,
      );
    }

    this.client = new OpenAI({ apiKey: apiKey.trim() });
    return this.client;
  }

  private getTextModel(): string {
    return this.config.get<string>("OPENAI_TEXT_MODEL") || "gpt-5-nano";
  }

  private getTranscriptionModel(): string {
    return (
      this.config.get<string>("OPENAI_TRANSCRIPTION_MODEL") ||
      this.config.get<string>("OPENAI_WHISPER_MODEL") ||
      "whisper-1"
    );
  }

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private tomorrowIso(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  private isValidIsoDate(value: string | null | undefined): value is string {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00`);
    return !Number.isNaN(parsed.getTime());
  }

  private normalizePriority(value: unknown): TaskPriority | null {
    const raw = String(value || "").trim().toLowerCase();
    if (Object.values(TaskPriority).includes(raw as TaskPriority)) {
      return raw as TaskPriority;
    }

    const keywordMap: Array<[string, TaskPriority]> = [
      ["critical", TaskPriority.CRITICAL],
      ["fori", TaskPriority.CRITICAL],
      ["jaldi", TaskPriority.CRITICAL],
      ["bahut zaroori", TaskPriority.CRITICAL],
      ["high", TaskPriority.HIGH],
      ["urgent", TaskPriority.HIGH],
      ["aham", TaskPriority.HIGH],
      ["ahmi", TaskPriority.HIGH],
      ["oonchi", TaskPriority.HIGH],
      ["ziyada", TaskPriority.HIGH],
      ["low", TaskPriority.LOW],
      ["kam", TaskPriority.LOW],
      ["dheemi", TaskPriority.LOW],
      ["medium", TaskPriority.MEDIUM],
      ["normal", TaskPriority.MEDIUM],
      ["darmiyani", TaskPriority.MEDIUM],
    ];

    for (const [keyword, priority] of keywordMap) {
      if (raw === keyword || raw.includes(keyword)) {
        return priority;
      }
    }

    return null;
  }

  private truncateTitle(text: string): string {
    const cleaned = String(text || "").trim().replace(/\s+/g, " ");
    if (!cleaned) return "Voice task";
    return cleaned.length > 120 ? `${cleaned.slice(0, 117)}...` : cleaned;
  }

  private resolveAudioMime(file: Express.Multer.File): string {
    const mime = (file.mimetype || "").toLowerCase();
    if (ALLOWED_AUDIO_MIME.has(mime)) return mime;
    const ext = file.originalname?.split(".").pop()?.toLowerCase();
    if (ext === "webm") return "audio/webm";
    if (ext === "wav") return "audio/wav";
    if (ext === "mp3") return "audio/mpeg";
    if (ext === "m4a") return "audio/mp4";
    if (ext === "ogg") return "audio/ogg";
    return mime;
  }

  async transcribeAudio(
    file: Express.Multer.File,
    language: "ur" | "en" = "ur",
  ): Promise<{ transcript: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException("Audio file is required");
    }

    const mime = this.resolveAudioMime(file);
    if (!ALLOWED_AUDIO_MIME.has(mime)) {
      throw new BadRequestException(
        "Unsupported audio format. Use webm, wav, mp3, m4a, or ogg.",
      );
    }

    const client = this.getClient();
    const ext = file.originalname?.split(".").pop() || "webm";
    const whisperLang = language === "en" ? "en" : "ur";

    try {
      const result = await client.audio.transcriptions.create({
        file: await toFile(file.buffer, `recording.${ext}`),
        model: this.getTranscriptionModel(),
        language: whisperLang,
        prompt:
          whisperLang === "ur"
            ? "Urdu and Roman Urdu ERP task instructions. Names, priorities, kal, parso, assignee."
            : "English ERP task instructions. Names, priorities, due dates, assignee.",
      });

      const transcript = String(result.text || "").trim();
      if (!transcript) {
        throw new BadRequestException("Could not detect speech in the recording.");
      }

      return { transcript };
    } catch (err: any) {
      this.logger.error(`Audio transcription failed: ${err?.message || err}`);
      if (err instanceof BadRequestException) throw err;
      throw new HttpException(
        err?.message || "Failed to transcribe audio",
        err?.status || 502,
      );
    }
  }

  private buildExtractPrompt(
    transcript: string,
    today: string,
    outputLanguage: VoiceTaskOutputLanguage,
    knownUsers: VoiceRosterUser[],
  ): string {
    const priorities = Object.values(TaskPriority).join(", ");
    const tomorrow = this.tomorrowIso();
    const langRule =
      outputLanguage === "ur"
        ? `IMPORTANT: title and description MUST be written in Urdu (Urdu script or clear Roman Urdu). Translate from English if the speech was in English.`
        : `IMPORTANT: title and description MUST be written in English. Translate from Urdu if the speech was in Urdu.`;

    const urExample = `{"title":"ڈونر احمد کو کال کرنا","description":"علی کے لیے کل high priority فالو اپ","priority":"high","due_date":"${tomorrow}","assignee_names":["Ali"],"assignee_ids":[]}`;
    const enExample = `{"title":"Call donor Ahmed","description":"High priority follow-up for Ali tomorrow","priority":"high","due_date":"${tomorrow}","assignee_names":["Ali"],"assignee_ids":[]}`;
    const exampleOutput =
      outputLanguage === "ur" ? urExample : enExample;

    const rosterLines = knownUsers
      .slice(0, 300)
      .map((u) => {
        const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
        return `- id=${u.id} name="${name || "Unknown"}"`;
      })
      .join("\n");

    const rosterBlock = rosterLines
      ? `Known staff roster (match spoken names to these exact spellings / ids):
${rosterLines}

When an assignee is mentioned, prefer the closest roster match.
- Prefer returning assignee_ids with the exact roster id(s).
- Also return assignee_names using the exact roster spelling (e.g. spoken "Hasan" → roster "Hassan").
- Never invent people who are not in the roster unless no close match exists.`
      : `No staff roster provided. Return assignee_names from speech as heard.`;

    return `You extract task fields from spoken instructions for an internal ERP task system.

The speaker may use English, Urdu, Roman Urdu, or a mix (e.g. "Ali ko kal donor follow up ka high priority task banao").

${langRule}

${rosterBlock}

Today's date is ${today} (YYYY-MM-DD). Resolve relative dates to YYYY-MM-DD, including:
- English: tomorrow, today, next week, next Friday, in 3 days
- Urdu/Roman Urdu: kal (tomorrow), aaj (today), parso (day after tomorrow), aglay hafte (next week), agla juma (next Friday)

Return ONLY valid JSON with these keys:
- title: short task title (string or null)
- description: fuller task description (string or null)
- priority: exactly one of ${priorities} or null. Map Urdu intent: aham/oonchi/ziyada/fori/jaldi → high or critical; kam/dheemi → low; otherwise medium.
- due_date: YYYY-MM-DD or null
- assignee_names: array of person names (empty array if none). Prefer exact roster spellings.
- assignee_ids: array of integer user ids from the roster (empty array if none / uncertain).

Rules:
- Keep title concise (max ~12 words).
- Use description for extra context from the speech.
- Do not invent assignees if not mentioned.
- If no clear title, derive one from the main action in the required output language (${outputLanguage === "ur" ? "Urdu" : "English"}).
- priority in JSON must be English enum only: low, medium, high, critical (or null).
- Handle near-homophones carefully: Hasan↔Hassan, Alee↔Ali, Ahmed↔Ahmad.

Example output for this request (title/description language = ${outputLanguage === "ur" ? "Urdu" : "English"}):
${exampleOutput}

Spoken transcript:
"""${transcript}"""`;
  }

  private parseExtract(raw?: string | null): VoiceTaskExtract {
    if (!raw?.trim()) {
      throw new HttpException("AI did not return task extraction data", 502);
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const str = (key: string): string | null => {
        const value = parsed[key];
        if (value == null) return null;
        const trimmed = String(value).trim();
        return trimmed ? trimmed : null;
      };

      const assigneeRaw = parsed.assignee_names;
      const assignee_names = Array.isArray(assigneeRaw)
        ? assigneeRaw
            .map((n) => String(n || "").trim())
            .filter(Boolean)
        : [];

      const idsRaw = parsed.assignee_ids;
      const assignee_ids = Array.isArray(idsRaw)
        ? idsRaw
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n > 0)
        : [];

      const due = str("due_date");
      const priorityRaw = str("priority");

      return {
        title: str("title"),
        description: str("description"),
        priority: priorityRaw ? this.normalizePriority(priorityRaw) : null,
        due_date: this.isValidIsoDate(due) ? due : null,
        assignee_names,
        assignee_ids,
      };
    } catch (err: any) {
      this.logger.error(`Failed to parse task extract JSON: ${err?.message || err}`);
      throw new HttpException("AI returned invalid task extraction data", 502);
    }
  }

  private async extractFromTranscript(
    transcript: string,
    outputLanguage: VoiceTaskOutputLanguage,
    knownUsers: VoiceRosterUser[],
  ): Promise<VoiceTaskExtract> {
    const client = this.getClient();
    const today = this.todayIso();

    const completion = await client.chat.completions.create({
      model: this.getTextModel(),
      messages: [
        {
          role: "user",
          content: this.buildExtractPrompt(
            transcript,
            today,
            outputLanguage,
            knownUsers,
          ),
        },
      ],
      // gpt-5-* models only support the default temperature
      temperature: 1,
      response_format: { type: "json_object" },
    });

    return this.parseExtract(completion.choices[0]?.message?.content);
  }

  private normalizeName(value: string): string {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  private levenshtein(a: string, b: string): number {
    const s = this.normalizeName(a);
    const t = this.normalizeName(b);
    if (s === t) return 0;
    if (!s.length) return t.length;
    if (!t.length) return s.length;

    const rows = s.length + 1;
    const cols = t.length + 1;
    const matrix: number[][] = Array.from({ length: rows }, () =>
      Array(cols).fill(0),
    );
    for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
    for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

    for (let i = 1; i < rows; i += 1) {
      for (let j = 1; j < cols; j += 1) {
        const cost = s[i - 1] === t[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }
    return matrix[s.length][t.length];
  }

  private userDisplayName(
    user: Pick<User, "first_name" | "last_name" | "email" | "id"> | VoiceRosterUser,
  ): string {
    const first = (user as any).first_name;
    const last = (user as any).last_name;
    const name = [first, last].filter(Boolean).join(" ").trim();
    if (name) return name;
    return (user as any).email || `User #${user.id}`;
  }

  private scoreNameMatch(
    query: string,
    user: Pick<User, "first_name" | "last_name" | "email" | "id"> | VoiceRosterUser,
  ): number {
    const q = this.normalizeName(query);
    if (!q) return 0;

    const full = this.normalizeName(this.userDisplayName(user as any));
    const first = this.normalizeName((user as any).first_name || "");
    const last = this.normalizeName((user as any).last_name || "");
    const emailLocal = this.normalizeName(
      String((user as any).email || "").split("@")[0] || "",
    );

    if (full && full === q) return 100;
    if (first && first === q) return 95;
    if (last && last === q) return 90;

    // Near-spellings: Hasan ↔ Hassan (edit distance 1–2)
    const firstDist = first ? this.levenshtein(q, first) : 99;
    const fullDist = full ? this.levenshtein(q, full) : 99;
    if (firstDist === 1 || fullDist === 1) return 88;
    if (firstDist === 2 || fullDist === 2) return 78;

    if (full && full.includes(q)) return 75;
    if (q.includes(full) && full) return 70;
    if (first && q.includes(first)) return 60;
    if (emailLocal && emailLocal.includes(q.replace(/\s+/g, "."))) return 55;
    return 0;
  }

  private async resolveAssignees(
    extract: VoiceTaskExtract,
    currentUser: User,
    knownUsers: VoiceRosterUser[],
  ): Promise<{ users: User[]; warnings: string[] }> {
    const warnings: string[] = [];
    const matched: User[] = [];
    const seen = new Set<number>();

    const pushUser = (user: User | null | undefined) => {
      if (!user?.id || seen.has(user.id)) return;
      matched.push(user);
      seen.add(user.id);
    };

    // 1) Prefer explicit IDs from model (validated against roster or DB)
    const rosterById = new Map(knownUsers.map((u) => [u.id, u]));
    const idCandidates = extract.assignee_ids.filter((id) =>
      knownUsers.length ? rosterById.has(id) : true,
    );

    if (idCandidates.length > 0) {
      const fromDb = await this.userRepo.find({
        where: { id: In(idCandidates) },
      });
      for (const id of idCandidates) {
        const found = fromDb.find((u) => u.id === id);
        if (found) pushUser(found);
      }
    }

    // 2) Name match against roster / DB users
    const cleanedNames = extract.assignee_names
      .map((n) => String(n || "").trim())
      .filter(Boolean);

    if (cleanedNames.length > 0 && matched.length === 0) {
      let candidates: Array<User | VoiceRosterUser> = knownUsers;
      if (candidates.length === 0) {
        candidates = await this.userRepo.find({
          where: { is_archived: false, isActive: true },
          take: 500,
        });
      }

      const matchedRosterIds: number[] = [];
      for (const name of cleanedNames) {
        let best: User | VoiceRosterUser | null = null;
        let bestScore = 0;

        for (const candidate of candidates) {
          const score = this.scoreNameMatch(name, candidate);
          if (score > bestScore) {
            bestScore = score;
            best = candidate;
          }
        }

        if (best && bestScore >= 55) {
          matchedRosterIds.push(best.id);
        } else {
          warnings.push(`Could not match assignee "${name}".`);
        }
      }

      if (matchedRosterIds.length > 0) {
        const fromDb = await this.userRepo.find({
          where: { id: In(matchedRosterIds) },
        });
        for (const id of matchedRosterIds) {
          pushUser(fromDb.find((u) => u.id === id));
        }
      }
    }

    if (matched.length === 0) {
      warnings.push("Using you as assignee because no names matched.");
      return { users: [currentUser], warnings };
    }

    return { users: matched, warnings };
  }

  async buildPayloadFromTranscript(
    transcript: string,
    currentUser: User,
    outputLanguage: VoiceTaskOutputLanguage = "ur",
    knownUsersInput: VoiceKnownUserDto[] = [],
  ): Promise<VoiceTaskBuildResult> {
    const cleanedTranscript = String(transcript || "").trim();
    if (!cleanedTranscript) {
      throw new BadRequestException("Transcript is required");
    }

    const knownUsers: VoiceRosterUser[] = (knownUsersInput || [])
      .map((u) => ({
        id: Number(u.id),
        first_name: u.first_name || null,
        last_name: u.last_name || null,
        department: u.department || null,
      }))
      .filter((u) => Number.isInteger(u.id) && u.id > 0)
      .slice(0, 300);

    const extract = await this.extractFromTranscript(
      cleanedTranscript,
      outputLanguage,
      knownUsers,
    );
    const warnings: string[] = [];

    const department =
      currentUser.department && Object.values(Department).includes(currentUser.department)
        ? currentUser.department
        : Department.ADMIN;

    const title =
      extract.title?.trim() ||
      this.truncateTitle(
        cleanedTranscript.split(/[.!?۔،]/)[0] || cleanedTranscript,
      );

    const description =
      extract.description?.trim() ||
      cleanedTranscript;

    const priority = extract.priority || TaskPriority.MEDIUM;
    const start_date = this.todayIso();
    const due_date =
      extract.due_date && this.isValidIsoDate(extract.due_date)
        ? extract.due_date
        : this.tomorrowIso();

    const { users: assignees, warnings: assigneeWarnings } =
      await this.resolveAssignees(extract, currentUser, knownUsers);
    warnings.push(...assigneeWarnings);

    const assigned_users = assignees.map((u) => u.id);
    const assigned_users_meta = assignees.map((u) => ({
      user_id: u.id,
      department: u.department || department,
    }));

    const movText = `Complete: ${title}`;

    const payload: CreateTaskDto = {
      title,
      description,
      department,
      priority,
      workflow_type: TaskWorkflowType.STANDARD,
      task_type: TaskType.ONE_TIME,
      start_date,
      due_date,
      assigned_users,
      assigned_users_meta,
      approval_required: false,
      reported_by_id: currentUser.id,
      mov_checklist: [
        {
          text: movText,
          checked: false,
          checked_by_id: 0,
          checked_at: new Date(0),
        },
      ],
    };

    return {
      transcript: cleanedTranscript,
      draft: {
        title,
        description,
        priority,
        due_date,
        start_date,
        department,
        assignee_labels: assignees.map(
          (u) => this.userDisplayName(u) || u.email || `User #${u.id}`,
        ),
        output_language: outputLanguage,
      },
      payload,
      warnings,
    };
  }
}
