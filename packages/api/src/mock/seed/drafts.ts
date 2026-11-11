// Draft emails for the demo. Real drafts will come from the backend; these are plain templates with a
// few tones, so Regenerate gives a visibly different version each time.

export type DraftInput = {
  firstName: string;
  company: string;
  topic: string;
  fact: string;
  senderFirstName: string;
};

export type DraftContent = { subject: string; body: string; factsUsed: string[] };

export const DRAFT_VARIANTS = 3;

export function composeDraft(input: DraftInput, version: number): DraftContent {
  const { firstName, company, topic, fact, senderFirstName } = input;
  const variant = (version - 1) % DRAFT_VARIANTS;
  const facts = [topic, fact];

  if (variant === 0) {
    return {
      subject: `${topic} for ${company}`,
      body: `Hi ${firstName},\n\nFollowing up on ${topic.toLowerCase()}. ${fact}\n\nWould a short call this week work to go through it?\n\n${senderFirstName}`,
      factsUsed: facts,
    };
  }
  if (variant === 1) {
    return {
      subject: `Quick note on ${topic.toLowerCase()}`,
      body: `Hi ${firstName},\n\nThanks for your time so far. ${fact} I have written it up so you can share it with your team.\n\nTell me what is missing and I will add it.\n\n${senderFirstName}`,
      factsUsed: [...facts, "Tone: warmer"],
    };
  }
  return {
    subject: `${company}: one question on ${topic.toLowerCase()}`,
    body: `Hi ${firstName},\n\n${fact}\n\nBefore I send more, what would you need to see to decide on ${topic.toLowerCase()}?\n\n${senderFirstName}`,
    factsUsed: [...facts, "Tone: asks a question"],
  };
}
