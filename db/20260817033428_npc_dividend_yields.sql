-- dividend_ratio now means TARGET ANNUAL YIELD on the share price (paid
-- weekly in game time, 52 periods a game year). Re-rate the NPC names to
-- real-world numbers: staples 3-5%, tobacco 6-7%, industrials ~1%, growth 0.
update stocks s set dividend_ratio = v.y, dps = 0
  from (values
    ('Atlas Provisions', 0.045),
    ('Consolidated Bakeries', 0.025),
    ('Harbor Retail Group', 0.035),
    ('Meridian Textiles', 0.015),
    ('Crestfield Spirits', 0.035),
    ('Bluebird Tobacco Co', 0.065),
    ('Nordvik Mining Systems', 0.01),
    ('Vesper Electronics', 0.0),
    ('Ironline Provisions', 0.0),
    ('HashWorks Mining', 0.0)
  ) as v(name, y)
  join entities e on e.name = v.name
 where s.company_entity = e.id;
