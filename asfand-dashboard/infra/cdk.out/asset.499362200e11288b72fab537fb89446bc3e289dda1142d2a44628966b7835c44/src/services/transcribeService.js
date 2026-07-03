/**
 * Transcription service — supports two engines:
 *   - 'aws'    : AWS Transcribe Medical (async job + poll)
 *   - 'whisper': OpenAI Whisper API (via HTTPS, synchronous)
 *
 * Engine is selected via SSM /era/ai/transcribe-engine (default: 'aws').
 * Mock mode returns stubbed transcript text.
 */
import { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand } from '@aws-sdk/client-transcribe';
import https from 'node:https';

/** @type {TranscribeClient | null} */
let transcribeClient = null;

function getTranscribeClient() {
  if (!transcribeClient) {
    transcribeClient = new TranscribeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  }
  return transcribeClient;
}

// ─── Mock store ──────────────────────────────────────────────────────────────
let mockTranscript = null;

export function useMock() {
  return process.env.TRANSCRIBE_USE_MOCK === 'true';
}

/** @param {string} transcript  Stubbed transcript text for tests */
export function __setTranscribeMock(transcript) { mockTranscript = transcript; }
export function __clearTranscribeMock()          { mockTranscript = null; }

// ─── AWS Transcribe ───────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS        = 60; // 3 minutes max

/**
 * Submit an async Transcribe job and poll until complete.
 * @param {{ jobName: string; s3Uri: string; languageCode?: string; medical?: boolean }} p
 * @returns {Promise<string>} plain-text transcript
 */
export async function transcribeWithAws(p) {
  const { jobName, s3Uri, languageCode = 'en-US', medical = false } = p;
  const client = getTranscribeClient();

  // Start job
  const outputBucket = process.env.S3_TRANSCRIPTS_BUCKET ?? process.env.S3_EVIDENCE_BUCKET;
  await client.send(
    new StartTranscriptionJobCommand({
      TranscriptionJobName: jobName,
      Media: { MediaFileUri: s3Uri },
      MediaFormat:    'mp4',
      LanguageCode:   languageCode,
      OutputBucketName: outputBucket,
      OutputKey:      `transcripts/${jobName}.json`,
      ...(medical ? { Specialty: 'PRIMARYCARE', Type: 'CONVERSATION' } : {}),
    })
  );

  // Poll for completion
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));

    const statusRes = await client.send(
      new GetTranscriptionJobCommand({ TranscriptionJobName: jobName })
    );
    const job = statusRes.TranscriptionJob;

    if (job?.TranscriptionJobStatus === 'COMPLETED') {
      const transcriptUri = job.Transcript?.TranscriptFileUri;
      if (!transcriptUri) throw new Error('[transcribe] No transcript URI in completed job');
      return await fetchTranscriptText(transcriptUri);
    }
    if (job?.TranscriptionJobStatus === 'FAILED') {
      throw new Error(`[transcribe] Job failed: ${job.FailureReason}`);
    }
  }
  throw new Error('[transcribe] Job timed out after polling limit');
}

/** @param {string} uri  HTTPS URL returned by Transcribe */
async function fetchTranscriptText(uri) {
  return new Promise((resolve, reject) => {
    https.get(uri, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text   = parsed.results?.transcripts?.[0]?.transcript ?? '';
          resolve(text);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ─── OpenAI Whisper ───────────────────────────────────────────────────────────

/**
 * @param {{ audioBuffer: Buffer; apiKey: string; model?: string }} p
 * @returns {Promise<string>}
 */
export async function transcribeWithWhisper(p) {
  const { audioBuffer, apiKey, model = 'whisper-1' } = p;
  const boundary = `----FormBoundary${Date.now()}`;

  const formParts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}`,
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.mp4"\r\nContent-Type: audio/mp4\r\n\r\n`,
  ];

  const header = Buffer.from(formParts.join('\r\n') + '\r\n', 'utf8');
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body   = Buffer.concat([header, audioBuffer, footer]);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.openai.com',
        path:     '/v1/audio/transcriptions',
        method:   'POST',
        headers: {
          Authorization:  `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) return reject(new Error(`[whisper] ${parsed.error.message}`));
            resolve(parsed.text ?? '');
          } catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
