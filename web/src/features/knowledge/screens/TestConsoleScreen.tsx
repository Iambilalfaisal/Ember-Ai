"use client";

import { useAskKnowledge } from "@ember/api";
import { AnswerCard, Button, ErrorState, Input, NotConfirmedCard, SourceChip } from "@ember/ui";
import { useState } from "react";
import { KnowledgeNav } from "../components/KnowledgeNav";

const EXAMPLES = [
  "How long does integration take?",
  "What does pricing look like per site?",
  "Do you have SOC 2 certification?",
];

export function TestConsoleScreen() {
  const ask = useAskKnowledge();
  const [question, setQuestion] = useState("");

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (trimmed) ask.mutate(trimmed);
  };
  const result = ask.data;

  return (
    <div className="space-y-6">
      <KnowledgeNav />
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit(question);
        }}
      >
        <label htmlFor="console-question" className="text-sm font-medium text-coal">
          Ask a question
        </label>
        <div className="flex gap-2">
          <Input
            id="console-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What would a customer ask on a call?"
            className="max-w-xl"
          />
          <Button type="submit" variant="primary" disabled={!question.trim() || ask.isPending}>
            Ask
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-detail text-smoke">Try</span>
          {EXAMPLES.map((example) => (
            <Button
              key={example}
              type="button"
              size="sm"
              onClick={() => {
                setQuestion(example);
                submit(example);
              }}
            >
              {example}
            </Button>
          ))}
        </div>
      </form>

      <div aria-live="polite">
        {ask.isPending ? (
          <p role="status" className="text-sm text-smoke">
            Searching the active documents.
          </p>
        ) : ask.isError ? (
          <ErrorState
            title="Couldn't get an answer"
            description="Check your connection and ask again."
            onRetry={() => submit(question)}
          />
        ) : result ? (
          <div className="space-y-4">
            {result.status === "answered" && result.answer ? (
              <AnswerCard key={result.question} answer={result.answer} streaming />
            ) : (
              <NotConfirmedCard
                holdingLine={result.holdingLine ?? ""}
                note="Nothing in the active documents confirms this."
              />
            )}
            <dl className="grid grid-cols-[auto_1fr] items-start gap-x-6 gap-y-2 text-sm">
              {result.status === "answered" ? (
                <>
                  <dt className="text-smoke">Confidence</dt>
                  <dd className="text-coal">{Math.round(result.confidence * 100)}%</dd>
                </>
              ) : null}
              <dt className="text-smoke">Sources used</dt>
              <dd>
                {result.sources.length === 0 ? (
                  <span className="text-coal">None</span>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {result.sources.map((source) => (
                      <li key={`${source.title}-${source.version}-${source.section}`}>
                        <SourceChip source={source} />
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </dl>
          </div>
        ) : (
          <p className="text-sm text-smoke">
            Answers come from active documents only. A question they cannot confirm returns Not
            confirmed.
          </p>
        )}
      </div>
    </div>
  );
}
