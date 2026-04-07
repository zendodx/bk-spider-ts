-- Active: 1770642790503@@127.0.0.1@3306@bk_spider
-- Active: 1770642790503@@127.0.0.1@3306@test
create database if not exists bk_spider;

use bk_spider;

drop table if exists house_listings;

create table `house_favorite`(
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    
    `title` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '标题',
    `header_image` VARCHAR(500) DEFAULT NULL COMMENT '头图URL',
    `header_image_desc` VARCHAR(255) DEFAULT NULL COMMENT '头图描述',
    
    `province` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '省',
    `city` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '市',
    `district` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '区',
    
    `community` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '小区名称',
    `community_url` VARCHAR(500) DEFAULT NULL COMMENT '小区链接',

    `detail_url` VARCHAR(500) DEFAULT NULL COMMENT '详情页URL',

    `note` VARCHAR(1000) DEFAULT NULL COMMENT '备注',

    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录更新时间',
    PRIMARY KEY (`id`)
)

create table `bk_cookie`(
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `host` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '访问地址',
    `cookie` VARCHAR(5000) NOT NULL DEFAULT '' COMMENT 'Cookie',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录更新时间'
)

CREATE TABLE `house_listings` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',

-- 基础信息
`title` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '标题',
`header_image` VARCHAR(500) DEFAULT NULL COMMENT '头图URL',
`header_image_desc` VARCHAR(255) DEFAULT NULL COMMENT '头图描述',

-- 地理位置（新增省市区）
`province` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '省',
`city` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '市',
`district` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '区',
`community` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '小区名称',
`community_url` VARCHAR(500) DEFAULT NULL COMMENT '小区链接',

-- 房屋属性
`floor_info` VARCHAR(50) DEFAULT NULL COMMENT '楼层信息（如：中楼层/共18层）',
`build_year` YEAR DEFAULT NULL COMMENT '建造年份',
`house_type` VARCHAR(50) DEFAULT NULL COMMENT '户型（如：3室2厅1卫）',
`area` DECIMAL(10, 2) DEFAULT NULL COMMENT '面积（平方米）',
`orientation` VARCHAR(50) DEFAULT NULL COMMENT '朝向（如：南北通透）',

-- 价格信息
`total_price` DECIMAL(12, 2) DEFAULT NULL COMMENT '总价（万元）',
`unit_price` DECIMAL(10, 2) DEFAULT NULL COMMENT '单价（元/平方米）',

-- 其他信息
`tags` VARCHAR(500) DEFAULT NULL COMMENT '标签（JSON或逗号分隔，如：近地铁,满五唯一）',
`detail_url` VARCHAR(500) DEFAULT NULL COMMENT '详情页URL',
`follow_count` INT UNSIGNED DEFAULT 0 COMMENT '关注人数',
`publish_time` DATETIME DEFAULT NULL COMMENT '发布时间',
`crawl_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '采集时间',

-- 系统字段
`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录更新时间',
`is_deleted` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '软删除标记：0-正常，1-已删除',
PRIMARY KEY (`id`),

-- 索引优化
KEY `idx_city_district` (`city`, `district`), -- 城市+区域查询
KEY `idx_community` (`community`), -- 小区查询
KEY `idx_price` (`total_price`), -- 价格区间查询
KEY `idx_area` (`area`), -- 面积区间查询
KEY `idx_house_type` (`house_type`), -- 户型查询
KEY `idx_publish_time` (`publish_time`), -- 发布时间排序
KEY `idx_crawl_time` (`crawl_time`), -- 采集时间查询
KEY `idx_build_year` (`build_year`), -- 年份筛选
KEY `idx_province_city` (
    `province`,
    `city`,
    `district`
), -- 三级联动查询

-- 唯一索引,避免重复插入

UNIQUE KEY `idx_detail_url_crawl_time` (`detail_url`, `crawl_time`) COMMENT '详情页URL+采集时间唯一索引'

    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='房产房源信息表';