import React from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {};

const TopBar = ({}: Props) => {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-sidebar px-4">
      <div className="relative flex-1 max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search"
          placeholder="Search content, titles, tags, types…"
          className="pl-9"
          readOnly
        />
      </div>
      <Button>
        <Plus className="size-4" />
        New Item
      </Button>
    </header>
  );
};

export default TopBar;
