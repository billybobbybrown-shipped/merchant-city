-- Stone, iron and now gold all come out of a quarry: one kind of site with a
-- resource chosen underneath it, the way farms choose a crop.
update lots set source_type = 'quarry_stone' where source_type = 'quarry';
update lots set source_type = 'quarry_iron'  where source_type = 'mine';
