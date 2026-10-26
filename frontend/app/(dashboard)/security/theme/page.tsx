"use client";

import React, { useState, useEffect } from "react";
import { Moon, Sun, Monitor, Palette, Check, Sparkles } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const THEMES = [
  { id: "dark", label: "Dark (Default)", icon: Moon, desc: "High contrast dark palette optimized for operations" },
  { id: "light", label: "Light", icon: Sun, desc: "Bright clean appearance for daylight environments" },
  { id: "system", label: "System Sync", icon: Monitor, desc: "Automatically adapt based on OS preferences" },
];

const ACCENTS = [
  { id: "blue", label: "Cobalt Blue", color: "bg-blue-600", border: "border-blue-500" },
  { id: "emerald", label: "Emerald Green", color: "bg-emerald-600", border: "border-emerald-500" },
  { id: "purple", label: "Royal Purple", color: "bg-purple-600", border: "border-purple-500" },
  { id: "amber", label: "Amber Orange", color: "bg-amber-600", border: "border-amber-500" },
];

export default function ThemeSettingsPage() {
  const [selectedTheme, setSelectedTheme] = useState<string>("dark");
  const [selectedAccent, setSelectedAccent] = useState<string>("blue");
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("stansiareco_theme");
    if (saved) setSelectedTheme(saved);
    const savedAcc = localStorage.getItem("stansiareco_accent");
    if (savedAcc) setSelectedAccent(savedAcc);
  }, []);

  const handleThemeSelect = (themeId: string) => {
    setSelectedTheme(themeId);
    localStorage.setItem("stansiareco_theme", themeId);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  const handleAccentSelect = (accentId: string) => {
    setSelectedAccent(accentId);
    localStorage.setItem("stansiareco_accent", accentId);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">Theme & Appearance</h2>
          <Badge variant="outline" className="text-xs">Preferences</Badge>
        </div>
        <p className="text-sm text-slate-400 mt-1">
          Customize the control plane display mode, color contrast, and accent highlights.
        </p>
      </div>

      {savedNotice && (
        <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0" />
          <span>Appearance preferences saved to your browser session.</span>
        </div>
      )}

      {/* Theme Modes */}
      <Card>
        <CardHeader>
          <CardTitle>Display Mode</CardTitle>
          <CardDescription>Select your preferred background illumination level</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {THEMES.map((theme) => {
              const isSelected = selectedTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => handleThemeSelect(theme.id)}
                  className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    isSelected
                      ? "bg-blue-600/10 border-blue-500 shadow-md shadow-blue-500/10"
                      : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <theme.icon className={`h-5 w-5 ${isSelected ? "text-blue-400" : "text-slate-400"}`} />
                    {isSelected && <Check className="h-4 w-4 text-blue-400" />}
                  </div>
                  <div>
                    <span className="font-semibold text-sm text-slate-100 block">{theme.label}</span>
                    <span className="text-xs text-slate-400 mt-1 block leading-relaxed">{theme.desc}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Accent Colors */}
      <Card>
        <CardHeader>
          <CardTitle>Accent Color Palette</CardTitle>
          <CardDescription>Choose the highlight color for active buttons, badges, and status meters</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {ACCENTS.map((accent) => {
              const isSelected = selectedAccent === accent.id;
              return (
                <button
                  key={accent.id}
                  onClick={() => handleAccentSelect(accent.id)}
                  className={`p-4 rounded-xl border text-center transition-all flex flex-col items-center gap-2.5 ${
                    isSelected
                      ? `bg-slate-900 border-slate-600 ring-2 ring-blue-500/40`
                      : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className={`h-7 w-7 rounded-full ${accent.color} flex items-center justify-center text-white shadow-md`}>
                    {isSelected && <Check className="h-4 w-4" />}
                  </div>
                  <span className="text-xs font-medium text-slate-200">{accent.label}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Live Preview */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-400" />
            <CardTitle>Theme Preview</CardTitle>
          </div>
          <CardDescription>Live preview of UI controls with current settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-6 rounded-xl border border-slate-800 bg-slate-950/80 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Primary Action</Button>
              <Button variant="secondary" size="sm">Secondary</Button>
              <Button variant="outline" size="sm">Outline Button</Button>
              <Button variant="destructive" size="sm">Destructive</Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Badge variant="default">ADMINISTRATOR</Badge>
              <Badge variant="success">ONLINE</Badge>
              <Badge variant="warning">OPERATOR</Badge>
              <Badge variant="destructive">DISABLED</Badge>
              <Badge variant="outline">PORT 22</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
