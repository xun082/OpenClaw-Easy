'use client';

import { Switch } from '@/components/ui/switch';
import type { OpenclawConfig } from '@/store/config-store';

import { FieldGroup } from './FieldGroup';
import { FormSection } from './FormSection';
import { SegmentedControl } from './SegmentedControl';
import { TagInput } from './TagInput';

// ─── Props ────────────────────────────────────────────────────────────────────

interface WhatsAppSectionProps {
  config: OpenclawConfig | null;
  setWaGroupPolicy: (policy: 'open' | 'allowlist') => void;
  setWaAllowFrom: (numbers: string[]) => void;
  setWaRequireMention: (required: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WhatsAppSection({
  config,
  setWaGroupPolicy,
  setWaAllowFrom,
  setWaRequireMention,
}: WhatsAppSectionProps) {
  return (
    <FormSection title="渠道 - WhatsApp" description="WhatsApp 消息渠道的接入白名单与群组触发规则">
      <div className="space-y-3">
        <FieldGroup
          label="群组策略 (groupPolicy)"
          hint="open：允许所有群组消息；allowlist：仅允许 allowFrom 白名单中的号码"
        >
          <SegmentedControl
            value={config?.channels?.whatsapp?.groupPolicy ?? 'open'}
            options={[
              { value: 'open', label: '开放（open）' },
              { value: 'allowlist', label: '白名单（allowlist）' },
            ]}
            onChange={(v) => setWaGroupPolicy(v as 'open' | 'allowlist')}
          />
        </FieldGroup>

        <FieldGroup
          label="允许的号码白名单 (allowFrom)"
          hint="填写国际格式号码；仅在群组策略为「白名单」时生效"
        >
          <TagInput
            values={config?.channels?.whatsapp?.allowFrom ?? []}
            onChange={setWaAllowFrom}
            placeholder="+8613800138000，按 Enter 添加，留空允许所有来源"
          />
        </FieldGroup>

        <div className="flex items-center justify-between py-2 px-4 rounded-lg border border-border bg-muted/20">
          <div>
            <p className="text-sm font-medium">群组消息需要 @ 提及</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              groups[&quot;*&quot;].requireMention — 群聊须 @openclaw 才触发智能体
            </p>
          </div>
          <Switch
            checked={config?.channels?.whatsapp?.groups?.['*']?.requireMention !== false}
            onCheckedChange={setWaRequireMention}
          />
        </div>
      </div>
    </FormSection>
  );
}
