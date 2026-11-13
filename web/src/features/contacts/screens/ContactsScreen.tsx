"use client";

import { useContacts } from "@ember/api";
import { EmptyState, ErrorState, Input, Skeleton } from "@ember/ui";
import Link from "next/link";
import { useState } from "react";

export function ContactsScreen() {
  const [q, setQ] = useState("");
  const { data, isPending, isError, refetch } = useContacts(q.trim() ? { q: q.trim() } : {});

  return (
    <div className="space-y-4">
      <Input
        type="search"
        aria-label="Search contacts"
        placeholder="Search by name or company"
        value={q}
        onChange={(event) => setQ(event.target.value)}
        className="w-72"
      />
      {isPending ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title="Couldn't load your contacts"
          description="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : data.length === 0 ? (
        <EmptyState
          title="No contacts match"
          description="Clear the search to see everyone you are working with."
        />
      ) : (
        <div className="ember-table-card">
          <table className="ember-table w-full border-collapse text-left text-sm">
            <caption className="sr-only">Contacts</caption>
            <thead>
              <tr className="border-b border-cinder text-detail text-smoke">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Name
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Company
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Email
                </th>
                <th scope="col" className="py-2 font-medium">
                  Phone
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cinder">
              {data.map(({ contact, company, dealId }) => (
                <tr key={contact.id} className="align-top">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-coal">{contact.name}</p>
                    <p className="text-detail text-smoke">{contact.title}</p>
                  </td>
                  <td className="py-3 pr-4">
                    <Link
                      href={`/deals/${dealId}`}
                      className="text-coal underline-offset-2 hover:underline"
                    >
                      {company}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <a
                      href={`mailto:${contact.email}`}
                      className="text-coal underline-offset-2 hover:underline"
                    >
                      {contact.email}
                    </a>
                  </td>
                  <td className="py-3 text-coal">{contact.phone ?? "Not on file"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
