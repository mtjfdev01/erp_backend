import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import OpenAI, { toFile } from "openai";
import { User, Department } from "../users/user.entity";
import { CreateTaskDto } from "./dto/create-task.dto";
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
}

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

  private normalizePriority(value: unknown): TaskPriority {
    const raw = String(value || "").trim().toLowerCase();
    if (Object.values(TaskPriority).includes(raw as TaskPriority)) {
      return raw as TaskPriority;
    }
    return TaskPriority.MEDIUM;
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

  async transcribeAudio(file: Express.Multer.File): Promise<{ transcript: string }> {
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

    try {
      const result = await client.audio.transcriptions.create({
        file: await toFile(file.buffer, `recording.${ext}`),
        model: this.getTranscriptionModel(),
        language: "en",
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

  private buildExtractPrompt(transcript: string, today: string): string {
    const priorities = Object.values(TaskPriority).join(", ");
    return `You extract task fields from spoken instructions for an internal ERP task system.

Today's date is ${today} (YYYY-MM-DD). Resolve relative dates like "tomorrow" or "next Friday" to YYYY-MM-DD.

Return ONLY valid JSON with these keys:
- title: short task title (string or null)
- description: fuller task description (string or null)
- priority: one of ${priorities} or null
- due_date: YYYY-MM-DD or null
- assignee_names: array of person names mentioned as assignees (empty array if none)

Rules:
- Keep title concise (max ~12 words).
- Use description for extra context from the speech.
- Do not invent assignees if not mentioned.
- If no clear title, derive one from the main action.

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

      const due = str("due_date");
      const priorityRaw = str("priority");

      return {
        title: str("title"),
        description: str("description"),
        priority: priorityRaw
          ? this.normalizePriority(priorityRaw)
          : null,
        due_date: this.isValidIsoDate(due) ? due : null,
        assignee_names,
      };
    } catch (err: any) {
      this.logger.error(`Failed to parse task extract JSON: ${err?.message || err}`);
      throw new HttpException("AI returned invalid task extraction data", 502);
    }
  }

  private async extractFromTranscript(
    transcript: string,
  ): Promise<VoiceTaskExtract> {
    const client = this.getClient();
    const today = this.todayIso();

    const completion = await client.chat.completions.create({
      model: this.getTextModel(),
      messages: [
        {
          role: "user",
          content: this.buildExtractPrompt(transcript, today),
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

  private userDisplayName(user: User): string {
    return [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  }

  private scoreNameMatch(query: string, user: User): number {
    const q = this.normalizeName(query);
    if (!q) return 0;

    const full = this.normalizeName(this.userDisplayName(user));
    const first = this.normalizeName(user.first_name || "");
    const last = this.normalizeName(user.last_name || "");
    const emailLocal = this.normalizeName((user.email || "").split("@")[0] || "");

    if (full && full === q) return 100;
    if (first && first === q) return 90;
    if (last && last === q) return 85;
    if (full && full.includes(q)) return 75;
    if (q.includes(full) && full) return 70;
    if (first && q.includes(first)) return 60;
    if (emailLocal && emailLocal.includes(q.replace(/\s+/g, "."))) return 55;
    return 0;
  }

  private async resolveAssignees(
    names: string[],
    currentUser: User,
  ): Promise<{ users: User[]; warnings: string[] }> {
    const warnings: string[] = [];
    const cleanedNames = names.map((n) => String(n || "").trim()).filter(Boolean);

    if (cleanedNames.length === 0) {
      return { users: [currentUser], warnings };
    }

    const candidates = await this.userRepo.find({
      where: { is_archived: false, isActive: true },
      take: 500,
    });

    const matched: User[] = [];
    const seen = new Set<number>();

    for (const name of cleanedNames) {
      let best: User | null = null;
      let bestScore = 0;

      for (const candidate of candidates) {
        const score = this.scoreNameMatch(name, candidate);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }

      if (best && bestScore >= 55 && !seen.has(best.id)) {
        matched.push(best);
        seen.add(best.id);
      } else {
        warnings.push(`Could not match assignee "${name}".`);
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
  ): Promise<VoiceTaskBuildResult> {
    const cleanedTranscript = String(transcript || "").trim();
    if (!cleanedTranscript) {
      throw new BadRequestException("Transcript is required");
    }

    const extract = await this.extractFromTranscript(cleanedTranscript);
    const warnings: string[] = [];

    const department =
      currentUser.department && Object.values(Department).includes(currentUser.department)
        ? currentUser.department
        : Department.ADMIN;

    const title =
      extract.title?.trim() ||
      this.truncateTitle(cleanedTranscript.split(/[.!?]/)[0] || cleanedTranscript);

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
      await this.resolveAssignees(extract.assignee_names, currentUser);
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
      },
      payload,
      warnings,
    };
  }
}
