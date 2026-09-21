import React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Share2, Link as LinkIcon, Mail, Twitter, Linkedin } from "lucide-react";
import { toast } from "sonner";

export default function ShareButton({ title, summary }) {
  const url = window.location.href;
  const text = `${title} — STEWART CAP`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const items = [
    ["share-x", Twitter, "Share on X", `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`],
    ["share-linkedin", Linkedin, "Share on LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`],
    ["share-email", Mail, "Send by email", `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(`${summary ? summary + "\n\n" : ""}${url}`)}`],
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="secondary" data-testid="article-share-btn"><Share2 className="w-4 h-4 mr-1.5" /> Share</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1.5" data-testid="share-popover">
        <button onClick={copy} data-testid="share-copy" className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-secondary text-left"><LinkIcon className="w-4 h-4 text-muted-foreground" /> Copy link</button>
        {items.map(([id, Icon, label, href]) => (
          <a key={id} href={href} target={id === "share-email" ? undefined : "_blank"} rel="noopener noreferrer" data-testid={id} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-secondary"><Icon className="w-4 h-4 text-muted-foreground" /> {label}</a>
        ))}
      </PopoverContent>
    </Popover>
  );
}
