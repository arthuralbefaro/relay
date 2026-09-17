"use client";

import type { StepStatus } from "@relay/engine";
import { createContext, useContext } from "react";

export type CanvasOverlay = {
    statusById: ReadonlyMap<string, StepStatus>;
    issuesById: ReadonlyMap<string, string[]>;
};

export const CanvasOverlayContext = createContext<CanvasOverlay>({ statusById: new Map(), issuesById: new Map() });

export const useCanvasOverlay = () => useContext(CanvasOverlayContext);