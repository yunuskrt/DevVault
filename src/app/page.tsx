import React from "react";
import TopBar from "@/components/dashboard/TopBar";
import Sidebar from "@/components/dashboard/Sidebar";
import MainArea from "@/components/dashboard/MainArea";

type Props = {};

const Home = ({}: Props) => {
  return (
    <div className="flex h-dvh flex-col">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <MainArea />
      </div>
    </div>
  );
};

export default Home;
