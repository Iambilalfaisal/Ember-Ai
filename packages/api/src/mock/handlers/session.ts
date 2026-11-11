import { z } from "zod";
import { User } from "../../domain";
import { clearDb, db } from "../db";
import { toUser } from "../mappers";
import { seedWorld } from "../seed";
import { route } from "./shared";

export const sessionHandlers = [
  route("get", "/me", { run: ({ user }) => toUser(user) }),

  // Everyone in the demo, for the role switcher.
  route("get", "/users", { run: () => z.array(User).parse(db.user.getAll().map(toUser)) }),

  route("post", "/demo/reset", {
    run: () => {
      clearDb();
      seedWorld();
    },
  }),
];
