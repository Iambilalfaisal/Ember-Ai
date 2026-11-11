import { callHandlers } from "./calls";
import { dealHandlers } from "./deals";
import { draftHandlers } from "./drafts";
import { knowledgeHandlers } from "./knowledge";
import { myDayHandlers } from "./myday";
import { reportHandlers } from "./reports";
import { sessionHandlers } from "./session";
import { teamHandlers } from "./team";

export const handlers = [
  ...sessionHandlers,
  ...myDayHandlers,
  ...dealHandlers,
  ...draftHandlers,
  ...teamHandlers,
  ...callHandlers,
  ...knowledgeHandlers,
  ...reportHandlers,
];

export { answerQuestion, HOLDING_LINE } from "./knowledge";
export { USER_HEADER } from "./shared";
