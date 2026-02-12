// app/api/signup/route.js — User registration endpoint
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import db from "@/lib/db";

export async function POST(req) {
    try {
        const { name, email, password } = await req.json();

        if (!name || !email || !password) {
            return NextResponse.json(
                { error: "Name, email, and password are required" },
                { status: 400 }
            );
        }

        if (password.length < 6) {
            return NextResponse.json(
                { error: "Password must be at least 6 characters" },
                { status: 400 }
            );
        }

        // Check if user exists
        const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
        if (existing) {
            return NextResponse.json(
                { error: "Email already registered" },
                { status: 409 }
            );
        }

        // Hash password and insert
        const hashedPassword = await bcrypt.hash(password, 12);
        const result = db
            .prepare("INSERT INTO users (name, email, password) VALUES (?, ?, ?)")
            .run(name, email, hashedPassword);

        return NextResponse.json(
            { message: "Account created successfully", userId: result.lastInsertRowid },
            { status: 201 }
        );
    } catch (error) {
        console.error("Signup error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
