import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: "otp",
      name: "OTP",
      credentials: {
        email: { type: "email" },
        code: { type: "text" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string)?.toLowerCase()?.trim();
        const code = credentials?.code as string;
        if (!email || !code) return null;

        // Find valid OTP
        const otp = await prisma.otpCode.findFirst({
          where: {
            email,
            code,
            used: false,
            expires: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
        });
        if (!otp) return null;

        // Mark OTP as used
        await prisma.otpCode.update({
          where: { id: otp.id },
          data: { used: true },
        });

        // Check if user is an admin or approved investor
        const admin = await prisma.adminUser.findUnique({ where: { email } });
        const investor = await prisma.investor.findUnique({ where: { email } });

        if (!admin && (!investor || investor.status === "dropped" || investor.status === "revoked")) {
          return null; // Reject unknown/dropped users
        }

        return {
          id: email, // Use email as the ID for JWT
          email,
          isAdmin: !!admin,
        };
      },
    }),
  ],
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  callbacks: {
    async jwt({ token, user }) {
      // On initial sign-in, add custom fields to token
      if (user) {
        token.email = user.email;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.isAdmin = (user as any).isAdmin ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.email) {
        session.user.email = token.email as string;

        // Check admin and investor status (fresh from DB each session access)
        const admin = await prisma.adminUser.findUnique({
          where: { email: token.email as string },
        });
        const investor = await prisma.investor.findUnique({
          where: { email: token.email as string },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session as any).isAdmin = !!admin;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session as any).investor = investor;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
});
