#!/bin/bash
cd "$(dirname "$0")"
mkdir -p Images/commons
failed=0
while IFS="|" read -r file url; do
  if [ -s "Images/commons/$file" ]; then echo "have  $file"; continue; fi
  if curl -fsSL -A "WandrPhotoFetch/1.0 (https://github.com/glov3rr/wandr)" -o "Images/commons/$file" "$url"; then
    echo "saved $file"
  else
    echo "FAILED $file"; rm -f "Images/commons/$file"; failed=$((failed+1))
  fi
  sleep 1
done <<LIST
Kintampo_waterfall_level_3.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Kintampo_waterfall_level_3.jpg?width=1280
Kintampo_Waterfalls.JPG|https://commons.wikimedia.org/wiki/Special:FilePath/Kintampo_Waterfalls.JPG?width=1280
Lake_Bosumtwi__Ghana.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Lake_Bosumtwi%2C_Ghana.jpg?width=1280
Manhyia_Palace_Museum__Kumasi__Ghana_2017_.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Manhyia_Palace_Museum_%28Kumasi%2C_Ghana_2017%29.jpg?width=1280
Manhyia_Palace_Entrance.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Manhyia_Palace_Entrance.jpg?width=1280
Boabeng_Fiema_monkey_sanctuary_3.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Boabeng_Fiema_monkey_sanctuary_3.jpg?width=1280
MONKEYS_AT_BOABENG-FIEMA_MONKEY_SANCTUARY.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/MONKEYS_AT_BOABENG-FIEMA_MONKEY_SANCTUARY.jpg?width=1280
Larabanga_Mosque_Ghana.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Larabanga_Mosque_Ghana.jpg?width=1280
Larabanga_Mosque_front_side.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Larabanga_Mosque_front_side.jpg?width=1280
Paga_Crocodile_Pond__tourism_.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Paga_Crocodile_Pond_%28tourism%29.jpg?width=1280
Crocodiles_in_the_Paga_Ponds.JPG|https://commons.wikimedia.org/wiki/Special:FilePath/Crocodiles_in_the_Paga_Ponds.JPG?width=1280
Nzulezo_stilt_village.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Nzulezo_stilt_village.jpg?width=1280
Akosombo_Dam_is_spilling_water__Ghana.JPG|https://commons.wikimedia.org/wiki/Special:FilePath/Akosombo_Dam_is_spilling_water%2C_Ghana.JPG?width=1280
Akosombo_Dam__Akosombo_Panorama.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Akosombo_Dam%2C_Akosombo_Panorama.jpg?width=1280
Tongo_Hills_and_Tengzug_Shrine__Ghana_2013_.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Tongo_Hills_and_Tengzug_Shrine_%28Ghana_2013%29.jpg?width=1280
Tongo_hills_and_Tengzug_shrine.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Tongo_hills_and_Tengzug_shrine.jpg?width=1280
Cape_Three_Points_Lighthouse_1875.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Cape_Three_Points_Lighthouse_1875.jpg?width=1280
Shining-blue_kingfisher__Alcedo_quadribrachys_quadribrachys__Ankasa_2.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Shining-blue_kingfisher_%28Alcedo_quadribrachys_quadribrachys%29_Ankasa_2.jpg?width=1280
Chestnut-breasted_nigrita__Nigrita_bicolor_bicolor__Ankasa.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Chestnut-breasted_nigrita_%28Nigrita_bicolor_bicolor%29_Ankasa.jpg?width=1280
Mona-TafiAtome20354.JPG|https://commons.wikimedia.org/wiki/Special:FilePath/Mona-TafiAtome20354.JPG?width=1280
Mona-TafiAtome20426.JPG|https://commons.wikimedia.org/wiki/Special:FilePath/Mona-TafiAtome20426.JPG?width=1280
Jamestown_Lighthouse__Accra__Ghana_2017_.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Jamestown_Lighthouse_%28Accra%2C_Ghana_2017%29.jpg?width=1280
Jamestown_Lighthouse__Accra.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Jamestown_Lighthouse%2C_Accra.jpg?width=1280
Black_Star_Square_and_Independence_Arch__Accra__Ghana.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Black_Star_Square_and_Independence_Arch%2C_Accra%2C_Ghana.jpg?width=1280
The_Black_Star_Gate.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/The_Black_Star_Gate.jpg?width=1280
Beach_in_Ada_Foah.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Beach_in_Ada_Foah.jpg?width=1280
Treasure_Island__Ada_Foah__P1090934-Pano_.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Treasure_Island%2C_Ada_Foah_%28P1090934-Pano%29.jpg?width=1280
Fort_William__Anomabo_8.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Fort_William%2C_Anomabo_8.jpg?width=1280
Fort_William__Anomabo_12.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Fort_William%2C_Anomabo_12.jpg?width=1280
Surfers_Surfing_at_Busua_Beach_in_Western_region__Ghana.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Surfers_Surfing_at_Busua_Beach_in_Western_region%2C_Ghana.jpg?width=1280
Busua_Beach_Resort_setting_in_Western_region__Ghana.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Busua_Beach_Resort_setting_in_Western_region%2C_Ghana.jpg?width=1280
Salaga_Slave_Well_in_Northern_Ghana.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Salaga_Slave_Well_in_Northern_Ghana.jpg?width=1280
Salaga_slave_museum_in_Northern_Ghana_03.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Salaga_slave_museum_in_Northern_Ghana_03.jpg?width=1280
Gambaga_Escarpment_01.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Gambaga_Escarpment_01.jpg?width=1280
Gambaga_Escarpment_landscape.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Gambaga_Escarpment_landscape.jpg?width=1280
LIST
echo
echo "Done. $failed failed."
