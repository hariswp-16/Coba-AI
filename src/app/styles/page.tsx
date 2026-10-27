import { StyleStudio } from "@/components/styles/StyleStudio";
import { listStyles } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export default function StylesPage() {
  return <StyleStudio initialStyles={listStyles()} />;
}
