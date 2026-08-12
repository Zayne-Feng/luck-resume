import type { Profile, ResumeSection, RichTextNode } from './model.ts';

export const sampleProfile: Profile = {
  name: '林知夏',
  headline: '产品设计师 / 用户体验设计',
  email: 'hello@example.com',
  phone: '138 0000 0000',
  location: '杭州',
  website: 'https://example.com',
  photo: '',
};

const paragraph = (text: string): RichTextNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});
const description = (lines: string[], list = true): RichTextNode => ({
  type: 'doc',
  content: list
    ? [
        {
          type: 'bulletList',
          content: lines.map((text) => ({ type: 'listItem', content: [paragraph(text)] })),
        },
      ]
    : lines.map(paragraph),
});

export function sampleSections(): ResumeSection[] {
  const makeEntry = (
    title: string,
    subtitle: string,
    startDate: string,
    endDate: string,
    lines: string[],
    list = true,
  ) => ({
    id: crypto.randomUUID(),
    title,
    subtitle,
    startDate,
    endDate,
    current: endDate === '至今',
    location: '',
    link: '',
    description: description(lines, list),
  });
  const sections: Omit<ResumeSection, 'columns'>[] = [
    {
      id: crypto.randomUUID(),
      type: 'summary',
      title: '个人简介',
      visible: true,
      items: [
        makeEntry(
          '',
          '',
          '',
          '',
          [
            '关注人与产品之间的每一次交互。擅长从用户研究出发，将复杂需求转化为清晰、自然的使用体验；期待与认真做产品的团队一起，让好设计发生。',
          ],
          false,
        ),
      ],
    },
    {
      id: crypto.randomUUID(),
      type: 'experience',
      title: '工作经历',
      visible: true,
      items: [
        makeEntry('远山设计工作室', '产品设计师', '2023.07', '至今', [
          '负责协作工具的核心体验设计，覆盖需求梳理、交互原型到视觉交付，推动设计方案与研发协同落地。',
          '通过用户访谈与可用性测试优化新手引导，简化关键操作路径，持续跟进上线后的用户反馈。',
          '整理团队组件库与交互规范，建立一致的设计语言，提升跨项目协作效率。',
        ]),
        makeEntry('拾光科技', '用户体验设计实习生', '2022.07', '2022.12', [
          '参与内容社区的移动端改版，完成信息架构梳理、页面设计与交互细节说明。',
          '协助开展竞品分析与用户研究，将调研发现转化为可执行的设计建议。',
        ]),
      ],
    },
    {
      id: crypto.randomUUID(),
      type: 'projects',
      title: '项目经历',
      visible: true,
      items: [
        makeEntry('「留白」个人知识管理工具', '独立设计项目', '2024.03', '2024.06', [
          '围绕「轻松记录、有序回顾」设计笔记工具，完成从用户场景、产品架构到交互与视觉的完整方案。',
          '构建标签与时间线相结合的浏览方式，通过交互原型验证信息查找与整理体验。',
        ]),
      ],
    },
    {
      id: crypto.randomUUID(),
      type: 'education',
      title: '教育经历',
      visible: true,
      items: [
        makeEntry(
          '江南大学',
          '视觉传达设计 / 本科',
          '2019.09',
          '2023.06',
          ['主修交互设计、设计心理学、信息可视化；参与校园服务设计与跨专业创新实践。'],
          false,
        ),
      ],
    },
    {
      id: crypto.randomUUID(),
      type: 'skills',
      title: '专业技能',
      visible: true,
      items: [
        makeEntry(
          '',
          '',
          '',
          '',
          [
            '设计工具：Figma、Adobe Illustrator、Photoshop',
            '专业能力：用户研究、交互设计、视觉设计、设计系统、原型验证',
            '协作方式：清晰表达、跨职能沟通、持续学习与迭代',
          ],
          false,
        ),
      ],
    },
  ];
  return sections.map((section) => ({ ...section, columns: 1 }));
}
