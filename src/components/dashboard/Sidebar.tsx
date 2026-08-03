import React from "react";

type Props = {};

const Sidebar = ({}: Props) => {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar p-4 md:block">
      <h2 className="text-lg font-semibold">Sidebar</h2>
    </aside>
  );
};

export default Sidebar;
