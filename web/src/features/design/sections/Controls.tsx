"use client";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SheetContent,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
} from "@ember/ui";
import { useId, useState } from "react";
import { Component, Section, State } from "../layout";

function Field({ label, children }: { label: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="max-w-sm">
      <label htmlFor={id} className="mb-1 block text-detail text-smoke">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

export function Controls() {
  const [on, setOn] = useState(true);
  return (
    <Section id="controls" title="Controls">
      <Component
        name="Button"
        note="Primary is neutral. Glow stays reserved for warmth and live answers."
      >
        <State label="Primary">
          <div className="flex flex-wrap gap-3">
            <Button variant="primary">Approve summary</Button>
            <Button variant="primary" size="sm">
              Handled
            </Button>
            <Button variant="primary" disabled>
              Send
            </Button>
          </div>
        </State>
        <State label="Secondary">
          <div className="flex flex-wrap gap-3">
            <Button>View draft</Button>
            <Button size="sm">Snooze 3 days</Button>
            <Button disabled>Regenerate</Button>
          </div>
        </State>
        <State label="Ghost">
          <div className="flex flex-wrap gap-3">
            <Button variant="ghost">Useful</Button>
            <Button variant="ghost">Wrong</Button>
          </div>
        </State>
      </Component>

      <Component name="Input and textarea">
        <State label="Default">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Company">
              {(id) => <Input id={id} defaultValue="Meridian Robotics" />}
            </Field>
            <Field label="Notes">
              {(id) => <Textarea id={id} defaultValue="Priya asked about the ERP connector." />}
            </Field>
          </div>
        </State>
        <State label="Empty">
          <Field label="Search documents">
            {(id) => <Input id={id} placeholder="Search by title or section" />}
          </Field>
        </State>
        <State label="Disabled">
          <Field label="Owner">
            {(id) => <Input id={id} defaultValue="Sam Okafor" disabled />}
          </Field>
        </State>
      </Component>

      <Component name="Switch">
        <State label="On and off">
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={on}
                onCheckedChange={setOn}
                aria-label="Hide panel from screen share"
              />
              Hide panel from screen share
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch aria-label="Notify me about stalled deals" />
              Notify me about stalled deals
            </label>
          </div>
        </State>
      </Component>

      <Component name="Tabs" note="Arrow keys move between tabs.">
        <State label="Default">
          <Tabs defaultValue="summary" className="max-w-xl">
            <TabsList>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
              <TabsTrigger value="tasks">Follow-ups</TabsTrigger>
            </TabsList>
            <TabsContent value="summary" className="text-sm">
              Tom asked about the integration timeline and the ERP connector.
            </TabsContent>
            <TabsContent value="transcript" className="text-sm">
              The full transcript appears here.
            </TabsContent>
            <TabsContent value="tasks" className="text-sm">
              Two follow-ups are waiting for approval.
            </TabsContent>
          </Tabs>
        </State>
      </Component>

      <Component
        name="Tooltip, popover, dialog and sheet"
        note="Floating layers get the shadow. Sheets and dialogs slide in over 320 ms, or appear instantly with reduced motion."
      >
        <State label="Tooltip">
          <Tooltip content="Last meaningful activity: 9 days ago">
            <Button>Hover or focus me</Button>
          </Tooltip>
        </State>
        <State label="Popover">
          <Popover>
            <PopoverTrigger asChild>
              <Button>Open popover</Button>
            </PopoverTrigger>
            <PopoverContent>
              <p className="font-medium">Integration guide v3, section 2</p>
              <p className="mt-1 text-smoke">
                Integration runs in three phases over six to eight weeks.
              </p>
            </PopoverContent>
          </Popover>
        </State>
        <State label="Dialog">
          <Dialog>
            <DialogTrigger asChild>
              <Button>Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle className="text-xl">Approve this summary?</DialogTitle>
              <DialogDescription className="mt-2 text-sm text-smoke">
                Approving adds two follow-ups to your tasks and removes this call from My Day.
              </DialogDescription>
              <div className="mt-6 flex justify-end gap-3">
                <DialogClose asChild>
                  <Button>Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="primary">Approve summary</Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </State>
        <State label="Sheet">
          <Dialog>
            <DialogTrigger asChild>
              <Button>Open sheet</Button>
            </DialogTrigger>
            <SheetContent>
              <DialogTitle className="text-xl">Meridian Robotics</DialogTitle>
              <DialogDescription className="mt-2 text-sm text-smoke">
                Priya Shah, VP Engineering. Discovery complete.
              </DialogDescription>
              <div className="mt-6">
                <DialogClose asChild>
                  <Button>Close</Button>
                </DialogClose>
              </div>
            </SheetContent>
          </Dialog>
        </State>
      </Component>
    </Section>
  );
}
