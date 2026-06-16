export default function LogoutButton() {
  return (
    <form action="/api/logout" method="post">
      <button
        type="submit"
        className="app-pill rounded-lg px-2.5 py-1.5 text-[0.78rem] font-medium text-slate-700 hover:text-slate-950 sm:px-3 sm:py-2 sm:text-sm"
      >
        Logout
      </button>
    </form>
  );
}
