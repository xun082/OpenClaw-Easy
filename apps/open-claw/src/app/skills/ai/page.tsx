import AiSkillSearch from '../_components/AiSkillSearch';

export default function AiSkillsPage() {
  return (
    <div className="px-8 py-8">
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-foreground tracking-tight mb-1">AI 推荐</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          用自然语言描述需求，AI 将语义搜索 ClawHub 并为你精准推荐技能。
        </p>
      </div>

      <AiSkillSearch />
    </div>
  );
}
