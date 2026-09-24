import { NextRequest } from "next/server";
import { postContact } from "@/lib/contact";
export async function POST(req: NextRequest) { return postContact(req); }
