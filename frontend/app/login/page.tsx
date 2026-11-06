"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Lock, User, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.push("/");
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Please enter your username or Employee ID, and password.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await login(username.trim(), password);
      router.push("/");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Invalid username, Employee ID, or password. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Logo & Heading */}
        <div className="flex flex-col items-center justify-center mb-2">
          <Image
            src="/Sunset-Group-Logo.png"
            alt="Sunset Group Logo"
            width={100}
            height={125}
            className="h-24 w-auto object-contain mx-auto mb-2 drop-shadow-xs"
            priority
          />
          <h1 className="font-extrabold text-2xl text-slate-900 tracking-tight block">
            SUNSET GROUP
          </h1>
          <span className="text-xs text-green-700 font-bold uppercase tracking-widest block mt-0.5">
            Daily Call Activity Dashboard
          </span>
        </div>
        <h2 className="mt-4 text-center text-xl font-bold tracking-tight text-slate-900">
          Sign in to your account
        </h2>
        <p className="mt-1 text-center text-xs text-slate-500">
          Sign in with your username or 8-digit Employee ID
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 sm:px-10 border border-slate-200 rounded-lg shadow-xs">
          {error && (
            <div className="mb-5 p-3 rounded-md bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="username"
                className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1"
              >
                Username or Employee ID
              </label>
              <div className="relative rounded-md shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <User className="h-4 w-4" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username or Employee ID (e.g. 20260001)"
                  className="block w-full pl-9 pr-3 py-2 text-sm font-semibold text-slate-800 border border-slate-300 rounded-md placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600 bg-white"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1"
              >
                Password
              </label>
              <div className="relative rounded-md shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-9 pr-10 py-2 text-sm font-semibold text-slate-800 border border-slate-300 rounded-md placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 transition-colors focus:outline-none"
                  title={showPassword ? "Hide password" : "Show password"}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full mt-2"
              size="lg"
              loading={isSubmitting}
            >
              Sign In
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
