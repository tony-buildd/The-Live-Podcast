export interface TranscriptChunk {
  text: string;
  startTime: number;
  endTime: number;
}

export function buildMvpSystemPrompt(args: {
  videoTitle: string;
  currentTimestamp: number;
  chunks: TranscriptChunk[];
}): string {
  const { videoTitle, currentTimestamp, chunks } = args;

  const mins = Math.floor(currentTimestamp / 60);
  const secs = Math.floor(currentTimestamp % 60);
  const timestampLabel = `${mins}:${secs.toString().padStart(2, "0")}`;

  const transcriptText = chunks.map((c) => c.text).join(" ");

  // Recent context: last ~2 minutes for the "anchor" section
  const recentStart = Math.max(0, currentTimestamp - 120);
  const recentChunks = chunks.filter((c) => c.startTime >= recentStart);
  const recentText = recentChunks.map((c) => c.text).join(" ");

  let prompt = `You are helping a viewer who is watching the video "${videoTitle}".\n`;
  prompt += `They paused at ${timestampLabel} to ask you a question.\n\n`;

  if (transcriptText.length > 0) {
    prompt += `Here is what has been discussed in the video so far:\n`;
    prompt += `${transcriptText}\n\n`;
  }

  if (recentText.length > 0 && recentText !== transcriptText) {
    prompt += `The viewer just paused during this part of the discussion:\n`;
    prompt += `${recentText}\n\n`;
  }

  prompt += `Respond conversationally. You have general knowledge and the context of what's being discussed in the video. `;
  prompt += `The conversation is anchored to what was just being discussed, but you can draw on broader knowledge to give good answers. `;
  prompt += `Be natural. Don't lecture. Talk like a knowledgeable friend.`;

  return prompt;
}
