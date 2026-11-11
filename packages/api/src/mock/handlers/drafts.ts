import { Draft, UpdateDraftBody } from "../../domain";
import { getNow } from "../clock";
import { db } from "../db";
import { addInteraction, assertCanSeeDeal, getDeal, markDealAttended } from "../logic";
import { toDraft } from "../mappers";
import { composeDraft } from "../seed/drafts";
import { ApiError, notFound, route } from "./shared";

function getDraft(id: string) {
  return db.draft.findFirst({ where: { id: { equals: id } } }) ?? notFound("The draft");
}

export const draftHandlers = [
  // Drafts for an opportunity, newest first. Sent drafts stay, so the thread of what went out is visible.
  route("get", "/deals/:id/drafts", {
    run: ({ user, params }) => {
      const deal = getDeal(params["id"] ?? "");
      assertCanSeeDeal(user, deal);
      return db.draft
        .findMany({ where: { dealId: { equals: deal.id } } })
        .map(toDraft)
        .reverse();
    },
  }),

  route("patch", "/drafts/:id", {
    body: UpdateDraftBody,
    run: ({ params, body }) => {
      const draft = getDraft(params["id"] ?? "");
      if (draft.status === "sent")
        throw new ApiError(409, "already_sent", "This draft was already sent.");
      const data = {
        ...(body.subject !== undefined && { subject: body.subject }),
        ...(body.body !== undefined && { body: body.body }),
      };
      return toDraft(db.draft.update({ where: { id: { equals: draft.id } }, data }) ?? draft);
    },
  }),

  route("post", "/drafts/:id/regenerate", {
    run: ({ user, params }) => {
      const draft = getDraft(params["id"] ?? "");
      if (draft.status === "sent")
        throw new ApiError(409, "already_sent", "This draft was already sent.");
      const deal = getDeal(draft.dealId);
      const contact = db.contact.findFirst({ where: { id: { equals: deal.primaryContactId } } });
      const version = draft.version + 1;
      const [topic = "Next steps", fact = ""] = draft.factsUsed;
      const content = composeDraft(
        {
          firstName: contact?.name.split(" ")[0] ?? "",
          company: deal.company,
          topic,
          fact,
          senderFirstName: user.name.split(" ")[0] ?? "",
        },
        version,
      );
      return Draft.parse(
        toDraft(
          db.draft.update({
            where: { id: { equals: draft.id } },
            data: {
              subject: content.subject,
              body: content.body,
              factsUsed: content.factsUsed,
              version,
            },
          }) ?? draft,
        ),
      );
    },
  }),

  route("post", "/drafts/:id/send", {
    run: ({ user, params }) => {
      const draft = getDraft(params["id"] ?? "");
      if (draft.status === "sent")
        throw new ApiError(409, "already_sent", "This draft was already sent.");
      const sent = db.draft.update({
        where: { id: { equals: draft.id } },
        data: { status: "sent", sentAt: getNow().toISOString() },
      });
      addInteraction({
        dealId: draft.dealId,
        type: "email",
        summary: `Sent: ${draft.subject}`,
        userId: user.id,
      });
      // Sending closes the loop: the item leaves My Day and the opportunity is on track again.
      markDealAttended(draft.dealId, `Sent: ${draft.subject}`);
      return toDraft(sent ?? draft);
    },
  }),
];
