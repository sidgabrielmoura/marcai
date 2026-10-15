"use client";

import { Fragment } from "react";

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { usePlatformActivityContext } from "./platform-async";

export function PlatformPagination({
  page,
  pages,
  total,
  pageSize,
  href,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  href: (page: number) => string;
}) {
  const activity = usePlatformActivityContext();
  const numbers =
    pages <= 5
      ? Array.from({ length: pages }, (_, i) => i + 1)
      : [
          ...new Set([
            1,
            Math.max(1, page - 1),
            page,
            Math.min(pages, page + 1),
            pages,
          ]),
        ].sort((a, b) => a - b);
  const target = activity?.activeElement?.closest("a")?.getAttribute("href");
  const previousDisabled = page <= 1 || Boolean(activity?.busy);
  const nextDisabled = page >= pages || Boolean(activity?.busy);
  const loadingPrevious =
    activity?.busy &&
    activity.activeElement?.getAttribute("aria-label") === "Página anterior";
  const loadingNext =
    activity?.busy &&
    activity.activeElement?.getAttribute("aria-label") === "Próxima página";
  const blockDisabled = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <footer className="sa-pagination">
      <p>
        {total ? (page - 1) * pageSize + 1 : 0}–
        {Math.min(page * pageSize, total)} de {total} registros · 10 por página
      </p>
      <Pagination aria-label="Paginação da tabela">
        <PaginationContent>
          <PaginationItem>
            {loadingPrevious ? (
              <PaginationLink
                size="default"
                aria-label="Página anterior"
                aria-disabled="true"
                aria-busy="true"
              >
                <Spinner aria-label="Carregando página" />
                <span className="hidden sm:block">Anterior</span>
              </PaginationLink>
            ) : (
              <PaginationPrevious
                text="Anterior"
                aria-label="Página anterior"
                href={page > 1 ? href(page - 1) : undefined}
                aria-disabled={previousDisabled}
                tabIndex={previousDisabled ? -1 : undefined}
                onClick={previousDisabled ? blockDisabled : undefined}
              />
            )}
          </PaginationItem>
          {numbers.map((number, index) => (
            <Fragment key={number}>
              {index > 0 && number - numbers[index - 1] > 1 && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}
              <PaginationItem
                className={
                  number !== 1 && number !== pages && number !== page
                    ? "sa-page-neighbor"
                    : undefined
                }
              >
                <PaginationLink
                  href={href(number)}
                  isActive={number === page}
                  aria-label={`Página ${number}`}
                  aria-disabled={activity?.busy || number === page}
                  tabIndex={activity?.busy ? -1 : undefined}
                  onClick={
                    number === page || activity?.busy
                      ? blockDisabled
                      : undefined
                  }
                  aria-busy={
                    (activity?.busy && target === href(number)) || undefined
                  }
                >
                  {activity?.busy && target === href(number) ? (
                    <Spinner aria-label="Carregando página" />
                  ) : (
                    number
                  )}
                </PaginationLink>
              </PaginationItem>
            </Fragment>
          ))}
          <PaginationItem>
            {loadingNext ? (
              <PaginationLink
                size="default"
                aria-label="Próxima página"
                aria-disabled="true"
                aria-busy="true"
              >
                <Spinner aria-label="Carregando página" />
                <span className="hidden sm:block">Próxima</span>
              </PaginationLink>
            ) : (
              <PaginationNext
                text="Próxima"
                aria-label="Próxima página"
                href={page < pages ? href(page + 1) : undefined}
                aria-disabled={nextDisabled}
                tabIndex={nextDisabled ? -1 : undefined}
                onClick={nextDisabled ? blockDisabled : undefined}
              />
            )}
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </footer>
  );
}
