export const helmholtzCommand = {
  name: 'helmholtz',
  description: 'ヘルムホルツの設定をします',
  options: [
    {
      name: 'gender',
      description: '自分の声の性別を変更します',
      type: 1, // SUB_COMMAND
      options: [
        {
          name: 'voice-gender',
          description: '男性か女性かを選択できます',
          type: 3, // STRING
          choices: [
            {
              name: '男性',
              value: 'male',
            },
            {
              name: '女性',
              value: 'female',
            },
          ],
          required: true,
        },
      ],
    },
    {
      name: 'pitch',
      description: '自分の声の高さを調節します',
      type: 1, // SUB_COMMAND
      options: [
        {
          name: 'value',
          description: '声の高さです。-20から20まで指定できます',
          type: 4, // INTEGER
          required: true,
        },
      ],
    },
  ],
};
