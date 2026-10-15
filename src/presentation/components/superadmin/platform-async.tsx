"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { useRouter, unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export function usePlatformActivity() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("Salvando alterações…");
  const [transitionPending, startTransition] = useTransition();
  const [activeElement, setActiveElement] = useState<HTMLElement | null>(null);
  const mutationLock = useRef(false);
  const navigationLock = useRef(false);
  const origin = useRef<HTMLElement | null>(null);
  const locked = () => mutationLock.current || navigationLock.current;

  useEffect(() => {
    if (!transitionPending) navigationLock.current = false;
  }, [transitionPending]);

  function beginMutation(message = "Salvando alterações…") {
    if (locked()) return null;
    mutationLock.current = true;
    setSaving(true);
    setLabel(message);
    setActiveElement(origin.current);
    return () => {
      mutationLock.current = false;
      setSaving(false);
    };
  }

  function navigate(href: string, element?: HTMLElement | null) {
    if (locked()) return;
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== "/superadmin")
      return;
    if (url.href === window.location.href) return;
    navigationLock.current = true;
    setActiveElement(element ?? origin.current);
    startTransition(() => router.push(url.pathname + url.search + url.hash));
  }

  function refresh() {
    navigationLock.current = true;
    setActiveElement(null);
    startTransition(() => router.refresh());
  }

  return {
    busy: saving || transitionPending,
    saving,
    label,
    activeElement,
    locked,
    beginMutation,
    navigate,
    refresh,
    recordTarget: (element: HTMLElement | null) => {
      origin.current = element;
    },
  };
}

type Activity = ReturnType<typeof usePlatformActivity>;
const PlatformActivityContext = createContext<Activity | null>(null);
export const usePlatformActivityContext = () =>
  useContext(PlatformActivityContext);

export function PlatformActivityBoundary({
  activity,
  children,
}: {
  activity: Activity;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  return (
    <PlatformActivityContext value={activity}>
      <div
        className="sa-operation-boundary"
        data-platform-ready={ready}
        aria-busy={activity.busy}
        onClickCapture={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          const control = target.closest<HTMLElement>(
            'a,button,[role="menuitem"],[role="tab"],summary',
          );
          if (!control) return;
          if (
            activity.locked() ||
            control.getAttribute("aria-disabled") === "true"
          ) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          activity.recordTarget(control);
          const link = control.closest<HTMLAnchorElement>("a[href]");
          if (
            !link ||
            link.target === "_blank" ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          const url = new URL(link.href, window.location.href);
          if (
            url.origin === window.location.origin &&
            url.pathname === "/superadmin"
          ) {
            event.preventDefault();
            event.stopPropagation();
            activity.navigate(link.href, link);
          }
        }}
      >
        {children}
        {activity.busy && (
          <div className="sa-operation-status" role="status">
            <Spinner aria-hidden="true" />
            {activity.saving ? activity.label : "Carregando…"}
          </div>
        )}
      </div>
    </PlatformActivityContext>
  );
}

export function PlatformButton({
  children,
  disabled,
  type,
  ref: externalRef,
  ...props
}: ComponentProps<typeof Button>) {
  const status = useFormStatus();
  const activity = usePlatformActivityContext();
  const internalRef = useRef<HTMLButtonElement | null>(null);
  const loading =
    (status.pending && type === "submit") ||
    Boolean(activity?.busy && activity.activeElement === internalRef.current);

  const handleRef = (element: HTMLButtonElement | null) => {
    internalRef.current = element;
    if (typeof externalRef === "function") {
      externalRef(element);
    } else if (externalRef && typeof externalRef === "object" && "current" in externalRef) {
      (externalRef as React.MutableRefObject<HTMLButtonElement | null>).current = element;
    }
  };

  return (
    <Button
      {...props}
      ref={handleRef}
      type={type}
      disabled={disabled || status.pending || activity?.busy}
      aria-busy={loading || undefined}
      data-platform-loading={loading || undefined}
    >
      {loading && <Spinner aria-hidden="true" data-icon="inline-start" />}
      {children}
    </Button>
  );
}

export function PlatformForm({
  action,
  children,
  onSubmitCapture,
  standalone = false,
  ...props
}: ComponentProps<"form"> & { standalone?: boolean }) {
  const activity = usePlatformActivityContext();
  const submitLock = useRef(false);
  return (
    <form
      {...props}
      action={
        typeof action === "function"
          ? async (data) => {
              const release = standalone
                ? activity?.beginMutation("Encerrando sessão…")
                : undefined;
              if (standalone && activity && !release) {
                submitLock.current = false;
                return;
              }
              try {
                await action(data);
              } catch (error) {
                unstable_rethrow(error);
                if (!standalone) throw error;
                toast.add({
                  title: "Não foi possível sair",
                  description: "Tente novamente.",
                  type: "error",
                });
              } finally {
                release?.();
                submitLock.current = false;
              }
            }
          : action
      }
      onSubmitCapture={(event) => {
        if (submitLock.current || activity?.locked()) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        activity?.recordTarget(
          submitter ??
            event.currentTarget.querySelector('button[type="submit"]'),
        );
        if (typeof action === "function") submitLock.current = true;
        onSubmitCapture?.(event);
        if (
          typeof action === "string" &&
          action === "/superadmin" &&
          activity
        ) {
          event.preventDefault();
          const params = new URLSearchParams();
          for (const [key, value] of new FormData(event.currentTarget))
            if (typeof value === "string" && value) params.set(key, value);
          activity.navigate(`/superadmin?${params}`, submitter);
        }
      }}
    >
      <PlatformFormFields>{children}</PlatformFormFields>
    </form>
  );
}

function PlatformFormFields({ children }: { children: ReactNode }) {
  const status = useFormStatus();
  const activity = usePlatformActivityContext();
  return (
    <fieldset
      className="sa-form-fields"
      disabled={status.pending || activity?.busy}
    >
      {children}
    </fieldset>
  );
}
