import { Megaphone, Lightbulb, HelpCircle, Share } from "lucide-react";
import type { PostTemplate } from "@/types";

interface TemplateSelectorProps {
  selectedTemplate: string;
  onTemplateChange: (template: string) => void;
}

const templates: PostTemplate[] = [
  {
    id: "announcement",
    name: "Announcement",
    description: "News & updates",
    icon: "megaphone",
    content: "🚀 Excited to announce [your announcement here]!\n\n✨ Key highlights:\n• [Feature 1]\n• [Feature 2]\n• [Feature 3]\n\n[Call to action]\n\n#hashtag1 #hashtag2"
  },
  {
    id: "tip",
    name: "Tip/Insight",
    description: "Educational content",
    icon: "lightbulb",
    content: "💡 Pro tip: [Your insight here]\n\n🔍 Here's why this matters:\n[Explanation]\n\n🎯 Quick takeaway:\n[Summary]\n\n#tips #productivity #learning"
  },
  {
    id: "question",
    name: "Question",
    description: "Engage audience",
    icon: "help-circle",
    content: "🤔 Question for the community:\n\n[Your question here]\n\n💭 I'm curious about your thoughts and experiences.\n\nDrop your answers in the comments! 👇\n\n#community #discussion"
  },
  {
    id: "share",
    name: "Share",
    description: "Link sharing",
    icon: "share",
    content: "📄 Found something interesting to share:\n\n[Brief description of what you're sharing]\n\n🔗 Link: [URL]\n\n💬 What do you think? Let me know your thoughts!\n\n#sharing #resources"
  }
];

export default function TemplateSelector({ selectedTemplate, onTemplateChange }: TemplateSelectorProps) {
  const iconMap = {
    megaphone: Megaphone,
    lightbulb: Lightbulb,
    "help-circle": HelpCircle,
    share: Share,
  };

  const colorMap = {
    announcement: "text-social-primary",
    tip: "text-social-warning",
    question: "text-social-secondary", 
    share: "text-social-accent",
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      {templates.map((template) => {
        const IconComponent = iconMap[template.icon as keyof typeof iconMap];
        const iconColor = colorMap[template.id as keyof typeof colorMap];
        const isSelected = selectedTemplate === template.id;

        return (
          <button
            key={template.id}
            onClick={() => onTemplateChange(template.id)}
            className={`template-card ${isSelected ? 'selected' : ''}`}
          >
            {IconComponent && <IconComponent className={`${iconColor} mb-2`} size={20} />}
            <div className="font-medium text-gray-900">{template.name}</div>
            <div className="text-xs text-gray-500">{template.description}</div>
          </button>
        );
      })}
    </div>
  );
}
